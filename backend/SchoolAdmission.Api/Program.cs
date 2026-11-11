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

public record CreateClassRequest(string? Name, int? TotalSeats);

public partial class Program { }