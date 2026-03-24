# Agent Guidelines for Database Manager

This document provides guidelines for agentic coding agents working on this codebase.

## Project Overview

Database Manager is a web application that creates and manages real database tables in Supabase (PostgreSQL) or SQLite. It consists of:
- **Frontend**: Pure HTML, CSS, JavaScript (vanilla, no framework)
- **Backend**: Node.js server (`server.js`) for SQLite connectivity
- **Database Clients**: `db-client.js` abstraction layer supporting multiple backends

## Build and Run Commands

### Starting the Application

```bash
# Start the local Node.js server (required for MS SQL or SQLite mode)
npm start
# or
npm run dev

# Open index.html in a browser (no build step needed for frontend)
# For Supabase mode: no server required, just open index.html
# For MS SQL/SQLite mode: ensure server is running first
```

### Running Tests

This project has **no automated tests** defined. To manually verify functionality:
1. Start the server with `npm start`
2. Open `index.html` in a browser
3. Test all CRUD operations through the UI

If adding tests, use a simple approach:
```bash
# Example (if Jest were added)
npm test -- --testNamePattern="specific test"

# Example (if Mocha)
npm test -- --grep "specific test"
```

### Linting and Formatting

This project has **no linting or formatting tools** configured. Code style follows vanilla JavaScript conventions (see below).

## Code Style Guidelines

### General Principles

- Write clean, readable code without over-optimization
- Use ES6+ features (const/let, arrow functions, async/await, template literals)
- Avoid experimental features not widely supported

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Variables | camelCase | `tableName`, `currentConfig` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_CONFIG`, `PORT` |
| Functions | camelCase | `loadTables()`, `createTable()` |
| Classes | PascalCase | `DatabaseClient`, `TableManager` |
| File names | kebab-case | `server.js`, `db-client.js`, `script.js` |
| Database tables | snake_case | `countries_visited`, `workaway_projects` |
| Database columns | snake_case | `created_at`, `column_name` |

### JavaScript Guidelines

**Variable Declaration:**
```javascript
// Use const by default, let when reassignment is needed
const tables = [];
let currentEditRow = null;

// Avoid var
```

**Functions:**
```javascript
// Use async/await for asynchronous operations
async function loadTables() {
    const data = await dbClient.getTables();
    return data;
}

// Arrow functions for callbacks
const handleClick = (event) => {
    // ...
};
```

**Strings:**
```javascript
// Template literals for dynamic strings
const message = `Table "${tableName}" created`;

// Single quotes preferred, double quotes when needed
const sql = "SELECT * FROM users";
```

**Comparison:**
```javascript
// Use strict equality (===) not loose equality (==)
// Explicit null checks
if (value !== null && value !== undefined) { }
```

### HTML/CSS Guidelines

**HTML:**
- Use semantic HTML5 elements (`<header>`, `<main>`, `<section>`)
- Lowercase tags and attributes
- Double quotes for attribute values

**CSS:**
- Use meaningful class names (e.g., `.table-container`, `.modal-content`)
- Group related styles
- Use Flexbox and Grid for layout
- Prefer relative units (rem, em) over pixels where appropriate

### Error Handling

**Frontend (script.js):**
```javascript
try {
    await dbClient.createTable(tableName, columns);
    showStatus(`Table "${tableName}" created successfully!`);
} catch (error) {
    showStatus(`Error creating table: ${error.message}`, 'error');
    console.error('Error:', error);
}
```

**Backend (server.js):**
```javascript
try {
    await sql.connect(currentConfig);
    const result = await sql.query(query);
    res.writeHead(200);
    res.end(JSON.stringify(result.recordset));
} catch (error) {
    console.error('Error:', error.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
}
```

### Security Considerations

- **Never commit credentials** - Use environment variables or user-provided input
- **SQL Injection Prevention** - Use parameterized queries where possible
  - In SQLite: use `?` placeholders: `db.all("SELECT * FROM table WHERE id = ?", [id])`
  - In MSSQL: use input sanitization for table/column names
- **Validate user input** - Check table/column names against regex `^[a-z][a-z0-9_]*$`
- **CORS** - Allow specific origins in production, not `*`

### Database Conventions

**Table Names:**
- Lowercase letters, numbers, underscores only
- Must start with a letter
- Descriptive and plural (e.g., `users`, `orders`, `products`)

**Column Names:**
- snake_case (e.g., `created_at`, `first_name`)
- Avoid reserved words
- Use meaningful names

**Common Columns (include in all tables):**
- `id` - Auto-incrementing primary key
- `created_at` - Timestamp for creation

### API Endpoints

When modifying the backend, follow REST conventions:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tables` | List all tables |
| GET | `/api/tables/:name` | Get table data |
| POST | `/api/tables` | Create table |
| POST | `/api/tables/:name/rows` | Insert row |
| PUT | `/api/tables/:name/rows/:id` | Update row |
| DELETE | `/api/tables/:name/rows/:id` | Delete row |
| DELETE | `/api/tables/:name` | Drop table |

### Database Abstraction Layer (db-client.js)

When adding new database backends:
1. Create a new adapter object with the same interface
2. Implement all required methods: `getTables()`, `createTable()`, `getTableData()`, etc.
3. Register in the main `DatabaseClient` class

### Code Organization

**Frontend:**
- `index.html` - Main UI structure and modals
- `style.css` - All styling
- `script.js` - Application logic
- `db-client.js` - Database abstraction layer

**Backend:**
- `server.js` - Node.js HTTP server with all API endpoints

### Common Tasks

**Adding a new API endpoint:**
1. Add route handler in `server.js`
2. Implement database logic
3. Return proper HTTP status codes (200, 201, 404, 500)
4. Handle errors with try/catch

**Adding frontend functionality:**
1. Add UI elements in `index.html`
2. Add styles in `style.css`
3. Add logic in `script.js`
4. Use `db-client.js` for database operations

**Debugging:**
- Check browser console for frontend errors
- Check terminal for server errors
- Use `console.log()` for debugging (remove before committing)
- Test API endpoints with curl or Postman

## Import Guidelines

No module system in use. Use global script includes:

```html
<script src="db-client.js"></script>
<script src="script.js"></script>
```

For Node.js backend, use CommonJS:
```javascript
const http = require('http');
const sql = require('mssql');
const sqlite3 = require('sqlite3').verbose();
```

## File Structure

```
database/
├── index.html          # Main HTML structure and modals
├── style.css           # All styling and responsive design
├── script.js           # Application logic
├── db-client.js        # Database abstraction layer
├── server.js           # Local Node.js backend (MS SQL/SQLite)
├── package.json        # Node.js dependencies
├── readme.md           # Project documentation
├── todo.md             # Implementation checklist
└── AGENTS.md           # This file
```

## Additional Notes

- The app uses localStorage for storing user credentials
- Two database modes are supported: Supabase (cloud) and SQLite (local)
- The SQLite database path is hardcoded in server.js - update as needed
- No TypeScript or linting is configured - plain JavaScript only