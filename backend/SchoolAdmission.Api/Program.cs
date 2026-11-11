using Dapper;
using Npgsql;

DefaultTypeMap.MatchNamesWithUnderscores = true;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration["DB_CONNECTION"]
    ?? "Host=localhost;Port=5433;Database=admission;Username=postgres;Password=postgres";
var dataSource = NpgsqlDataSource.Create(connectionString);

builder.Services.AddSingleton(dataSource);
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

await InitDb(dataSource);

const string ClassSelect = @"
SELECT c.id, c.name, c.total_seats,
  COUNT(h.id) FILTER (WHERE h.status = 'HELD' AND h.expires_at > now()) AS held_seats,
  COUNT(h.id) FILTER (WHERE h.status = 'CONFIRMED') AS confirmed_seats
FROM classes c
LEFT JOIN holds h ON h.class_id = c.id";

// 1. Class toiri
app.MapPost("/classes", async (CreateClassRequest req, NpgsqlDataSource db) =>
{
    if (string.IsNullOrWhiteSpace(req.Name) || req.TotalSeats is null or <= 0)
        return Results.BadRequest(new { error = "Class name is required and totalSeats must be greater than 0." });

    var id = "c_" + Guid.NewGuid().ToString("N")[..8];
    var name = req.Name.Trim();
    await using var conn = await db.OpenConnectionAsync();
    await conn.ExecuteAsync(
        "INSERT INTO classes (id, name, total_seats) VALUES (@id, @name, @seats)",
        new { id, name, seats = req.TotalSeats });
    return Results.Created($"/classes/{id}", new { id, name, totalSeats = req.TotalSeats });
});

// 2. Sob class-er list
app.MapGet("/classes", async (NpgsqlDataSource db) =>
{
    await using var conn = await db.OpenConnectionAsync();
    var rows = await conn.QueryAsync<ClassRow>(ClassSelect + " GROUP BY c.id ORDER BY c.created_at");
    return Results.Ok(rows.Select(ToDto));
});

// 3. Ekta class
app.MapGet("/classes/{id}", async (string id, NpgsqlDataSource db) =>
{
    await using var conn = await db.OpenConnectionAsync();
    var row = await conn.QuerySingleOrDefaultAsync<ClassRow>(
        ClassSelect + " WHERE c.id = @id GROUP BY c.id", new { id });
    return row is null
        ? Results.NotFound(new { error = "Class not found." })
        : Results.Ok(ToDto(row));
});

var holdSeconds = int.TryParse(app.Configuration["HOLD_DURATION_SECONDS"], out var hs) && hs > 0 ? hs : 600;

const string HoldSelect = @"
SELECT h.id, h.class_id, h.student_id, c.name AS class_name,
  CASE WHEN h.status = 'HELD' AND h.expires_at <= now() THEN 'EXPIRED' ELSE h.status END AS status,
  h.expires_at
FROM holds h JOIN classes c ON c.id = h.class_id";

static string? StudentId(HttpRequest r)
{
    var v = r.Headers["X-Student-Id"].ToString().Trim();
    return System.Text.RegularExpressions.Regex.IsMatch(v, @"^\d{17}$") ? v : null;
}

static string Iso(DateTime d) => d.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");

static IResult BadStudent() =>
    Results.BadRequest(new { error = "X-Student-Id header must be a 17-digit birth registration number." });

// 4. Apply (seat hold)
app.MapPost("/classes/{classId}/holds", async (string classId, HttpRequest req, NpgsqlDataSource db) =>
{
    var student = StudentId(req);
    if (student is null) return BadStudent();

    await using var conn = await db.OpenConnectionAsync();
    await using var tx = await conn.BeginTransactionAsync();

    // class row lock: ek class-e ekshathe onek request ashleo ek ek kore cholbe
    var total = await conn.QuerySingleOrDefaultAsync<int?>(
        "SELECT total_seats FROM classes WHERE id = @classId FOR UPDATE", new { classId }, tx);
    if (total is null) return Results.NotFound(new { error = "Class not found." });

    await conn.ExecuteAsync(
        "UPDATE holds SET status = 'EXPIRED' WHERE class_id = @classId AND status = 'HELD' AND expires_at <= now()",
        new { classId }, tx);

    var already = await conn.ExecuteScalarAsync<long>(
        "SELECT COUNT(*) FROM holds WHERE class_id = @classId AND student_id = @student AND status IN ('HELD','CONFIRMED')",
        new { classId, student }, tx);
    if (already > 0)
        return Results.Conflict(new { error = "You already have an active application for this class." });

    var taken = await conn.ExecuteScalarAsync<long>(
        "SELECT COUNT(*) FROM holds WHERE class_id = @classId AND status IN ('HELD','CONFIRMED')",
        new { classId }, tx);
    if (taken >= total.Value)
        return Results.Conflict(new { error = "No seats available in this class." });

    var holdId = "h_" + Guid.NewGuid().ToString("N")[..8];
    var expiresAt = await conn.QuerySingleAsync<DateTime>(
        @"INSERT INTO holds (id, class_id, student_id, status, expires_at)
          VALUES (@holdId, @classId, @student, 'HELD', now() + make_interval(secs => @secs))
          RETURNING expires_at",
        new { holdId, classId, student, secs = (double)holdSeconds }, tx);
    await tx.CommitAsync();

    return Results.Created($"/holds/{holdId}",
        new { holdId, classId, studentId = student, status = "HELD", expiresAt = Iso(expiresAt) });
});

// 5. Ekta hold-er obostha
app.MapGet("/holds/{holdId}", async (string holdId, NpgsqlDataSource db) =>
{
    await using var conn = await db.OpenConnectionAsync();
    var row = await conn.QuerySingleOrDefaultAsync<HoldRow>(HoldSelect + " WHERE h.id = @holdId", new { holdId });
    return row is null
        ? Results.NotFound(new { error = "Application not found." })
        : Results.Ok(new { holdId = row.Id, classId = row.ClassId, status = row.Status, expiresAt = Iso(row.ExpiresAt) });
});

// 6. Confirm (fee joma)
app.MapPost("/holds/{holdId}/confirm", async (string holdId, HttpRequest req, NpgsqlDataSource db) =>
{
    var student = StudentId(req);
    if (student is null) return BadStudent();

    await using var conn = await db.OpenConnectionAsync();
    await using var tx = await conn.BeginTransactionAsync();
    var row = await conn.QuerySingleOrDefaultAsync<HoldRow>(
        "SELECT id, class_id, student_id, status, expires_at, (expires_at <= now()) AS is_expired FROM holds WHERE id = @holdId FOR UPDATE",
        new { holdId }, tx);

    if (row is null) return Results.NotFound(new { error = "Application not found." });
    if (row.StudentId != student)
        return Results.Json(new { error = "This application belongs to another student." }, statusCode: 403);
    if (row.Status == "CONFIRMED")
        return Results.Ok(new { holdId, status = "CONFIRMED" }); // abar confirm korleo seat ek-i thakbe

    if (row.Status == "HELD" && !row.IsExpired)
    {
        await conn.ExecuteAsync("UPDATE holds SET status = 'CONFIRMED' WHERE id = @holdId", new { holdId }, tx);
        await tx.CommitAsync();
        return Results.Ok(new { holdId, status = "CONFIRMED" });
    }

    if (row.Status == "HELD")
    {
        await conn.ExecuteAsync("UPDATE holds SET status = 'EXPIRED' WHERE id = @holdId", new { holdId }, tx);
        await tx.CommitAsync();
    }
    return Results.Conflict(new { error = "This application has expired or was cancelled, so it cannot be confirmed." });
});

// 7. Cancel
app.MapDelete("/holds/{holdId}", async (string holdId, HttpRequest req, NpgsqlDataSource db) =>
{
    var student = StudentId(req);
    if (student is null) return BadStudent();

    await using var conn = await db.OpenConnectionAsync();
    await using var tx = await conn.BeginTransactionAsync();
    var row = await conn.QuerySingleOrDefaultAsync<HoldRow>(
        "SELECT id, class_id, student_id, status, expires_at FROM holds WHERE id = @holdId FOR UPDATE",
        new { holdId }, tx);

    if (row is null) return Results.NotFound(new { error = "Application not found." });
    if (row.StudentId != student)
        return Results.Json(new { error = "This application belongs to another student." }, statusCode: 403);
    if (row.Status == "CONFIRMED")
        return Results.Conflict(new { error = "A confirmed admission cannot be cancelled." });

    if (row.Status == "HELD")
    {
        await conn.ExecuteAsync("UPDATE holds SET status = 'CANCELLED' WHERE id = @holdId", new { holdId }, tx);
        await tx.CommitAsync();
    }
    return Results.NoContent();
});

// 8. Ei student-er sob abedon
app.MapGet("/me/holds", async (HttpRequest req, NpgsqlDataSource db) =>
{
    var student = StudentId(req);
    if (student is null) return BadStudent();

    await using var conn = await db.OpenConnectionAsync();
    var rows = await conn.QueryAsync<HoldRow>(
        HoldSelect + " WHERE h.student_id = @student ORDER BY h.created_at DESC", new { student });
    return Results.Ok(rows.Select(r => new
    {
        holdId = r.Id,
        classId = r.ClassId,
        className = r.ClassName,
        status = r.Status,
        expiresAt = Iso(r.ExpiresAt)
    }));
});

app.Run();

static object ToDto(ClassRow c) => new
{
    id = c.Id,
    name = c.Name,
    totalSeats = c.TotalSeats,
    heldSeats = c.HeldSeats,
    confirmedSeats = c.ConfirmedSeats,
    availableSeats = c.TotalSeats - c.HeldSeats - c.ConfirmedSeats
};

static async Task InitDb(NpgsqlDataSource ds)
{
    const string schema = @"
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_seats INT NOT NULL CHECK (total_seats > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS holds (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_holds_active
  ON holds (class_id, student_id) WHERE status IN ('HELD', 'CONFIRMED');";

    for (var attempt = 1; ; attempt++)
    {
        try
        {
            await using var conn = await ds.OpenConnectionAsync();
            await conn.ExecuteAsync(schema);
            return;
        }
        catch when (attempt < 20)
        {
            await Task.Delay(1500); // DB ready na hole kichukkhon opekkha
        }
    }
}

public class ClassRow
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int TotalSeats { get; set; }
    public long HeldSeats { get; set; }
    public long ConfirmedSeats { get; set; }
}

public class HoldRow
{
    public string Id { get; set; } = "";
    public string ClassId { get; set; } = "";
    public string StudentId { get; set; } = "";
    public string ClassName { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public bool IsExpired { get; set; }
}

public record CreateClassRequest(string? Name, int? TotalSeats);

public partial class Program { }