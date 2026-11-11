\# School Admission Management System



A web-based school admission management system built with ASP.NET Core, PostgreSQL, and React.



\## Technologies Used



\*\*Backend\*\*

\- ASP.NET Core Web API (.NET 8)

\- PostgreSQL

\- Dapper

\- Npgsql



\*\*Frontend\*\*

\- React

\- Vite

\- JavaScript

\- CSS



\*\*Infrastructure\*\*

\- Docker

\- Docker Compose

\- Git and GitHub



\## Features



\- View available classes and seat capacity.

\- Check available, held, and confirmed seats.

\- Apply for admission and reserve seats.

\- Student identification using a 17-digit Birth Registration Number.

\- Confirm admission reservations.

\- Cancel pending reservations.

\- View personal admission applications.

\- Automatic expiration of pending seat holds.

\- Prevent seat overbooking using database transactions.

\- PostgreSQL database integration.



\## Project Structure



```text

school-admission-system/

├── backend/

│   ├── Dockerfile

│   └── SchoolAdmission.Api/

│       ├── Program.cs

│       └── SchoolAdmission.Api.csproj

├── frontend/

│   ├── public/

│   ├── src/

│   ├── package.json

│   └── README.md

├── docker-compose.yml

├── .gitignore

└── README.md

```



\## Run the Project



\### 1. Start Backend and Database



```bash

docker compose up --build

```



Backend API:



`http://localhost:8080`



\### 2. Start Frontend



Open another terminal:



```bash

cd frontend

npm install

npm run dev

```



Open the Vite URL shown in the terminal.



\## API Endpoints



| Method | Endpoint | Description |

|---|---|---|

| GET | /classes | List all classes |

| POST | /classes | Create a class |

| GET | /classes/{id} | Get class details |

| POST | /classes/{classId}/holds | Apply for admission |

| GET | /holds/{holdId} | Get application status |

| POST | /holds/{holdId}/confirm | Confirm admission |

| DELETE | /holds/{holdId} | Cancel application |

| GET | /me/holds | View student applications |



Student endpoints require the `X-Student-Id` header containing a 17-digit Birth Registration Number.



\## Database



PostgreSQL is used to store classes and admission applications. Docker Compose starts the database and backend services.



\## Author



School Admission Management System

