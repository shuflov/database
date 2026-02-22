const http = require('http');
const sql = require('mssql');
const url = require('url');

// Default SQL Server configuration
const defaultConfig = {
  server: '.\\SQLEXPRESS',               // force correct instance from start
  port: 1433,
  database: 'test',
  user: 'appuser',
  password: 'Test1234!',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    enableArithAbort: true
  }
};

// Store user-provided credentials in memory
let currentConfig = { ...defaultConfig };

// Helper to get config — ALWAYS merge with forced defaults if invalid
function getSqlConfig(userCredentials = {}) {
  const cfg = { ...currentConfig };

  // Override with user input, but fix common mistakes
  if (userCredentials.server) {
    let srv = userCredentials.server.trim();
    if (srv === '.' || srv === '' || srv === 'localhost') {
      srv = '.\\SQLEXPRESS'; // force correct name
    }
    cfg.server = srv;
  }
  if (userCredentials.port) cfg.port = parseInt(userCredentials.port) || 1433;
  if (userCredentials.database) cfg.database = userCredentials.database.trim() || 'test';
  if (userCredentials.user) cfg.user = userCredentials.user.trim() || 'appuser';
  if (userCredentials.password) cfg.password = userCredentials.password || 'Test1234!';

  return cfg;
}

const PORT = process.env.PORT || 3000;

// Helper to parse request body
function parseBody(req, callback) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            callback(JSON.parse(body || '{}'));
        } catch (e) {
            callback({});
        }
    });
}

// CORS headers
function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
}

// Server
const server = http.createServer(async (req, res) => {
    setCORS(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const method = req.method;

    console.log(`${method} ${path}`);

    try {
        // Set SQL Server configuration
        if (path === '/api/config' && method === 'POST') {
            parseBody(req, async (body) => {
                // Update currentConfig with validated values
                currentConfig = getSqlConfig(body);

                res.writeHead(200);
                res.end(JSON.stringify({ 
                message: 'Config updated', 
                config: {
                    server: currentConfig.server,
                    port: currentConfig.port,
                    database: currentConfig.database,
                    user: currentConfig.user ? currentConfig.user : '(using default)'
                }
                }));
            });
            return;
        }

        // Health check
        if (path === '/api/health' && method === 'GET') {
            await sql.connect(currentConfig);
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', connected: true, database: currentConfig.database }));
            return;
        }

        // List all tables
        if (path === '/api/tables' && method === 'GET') {
            await sql.connect(currentConfig);
            const result = await sql.query(`
                SELECT 
                    t.name as table_name,
                    STRING_AGG(c.name + ':' + ty.name, ',') as columns
                FROM sys.tables t
                LEFT JOIN sys.columns c ON t.object_id = c.object_id
                LEFT JOIN sys.types ty ON c.user_type_id = ty.user_type_id
                WHERE t.is_ms_shipped = 0
                GROUP BY t.name
                ORDER BY t.name
            `);
            
            const tables = result.recordset.map(row => {
                const cols = row.columns ? row.columns.split(',').map(col => {
                    const [name, type] = col.split(':');
                    return { column_name: name, data_type: type };
                }) : [];
                return { table_name: row.table_name, columns: cols };
            });
            
            res.writeHead(200);
            res.end(JSON.stringify(tables));
            return;
        }

        // Get table data
        if (path.match(/\/api\/tables\/([^/]+)$/) && method === 'GET') {
            const tableName = path.match(/\/api\/tables\/([^/]+)$/)[1];
            const limit = parsedUrl.query.limit || 100;
            
            await sql.connect(currentConfig);
            const result = await sql.query(`
                SELECT TOP ${limit} * FROM [${tableName}] ORDER BY id
            `);
            
            res.writeHead(200);
            res.end(JSON.stringify(result.recordset));
            return;
        }

        // Create table
        if (path === '/api/tables' && method === 'POST') {
            parseBody(req, async (body) => {
                const { tableName, columns } = body;
                
                const columnDefs = columns.map(col => `[${col}] NVARCHAR(MAX)`).join(', ');
                const query = `
                    CREATE TABLE [${tableName}] (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        ${columnDefs},
                        created_at DATETIME DEFAULT GETDATE()
                    )
                `;
                
                await sql.connect(currentConfig);
                await sql.query(query);
                
                res.writeHead(201);
                res.end(JSON.stringify({ message: 'Table created' }));
            });
            return;
        }

        // Insert row
        if (path.match(/\/api\/tables\/([^/]+)\/rows$/) && method === 'POST') {
            const tableName = path.match(/\/api\/tables\/([^/]+)\/rows$/)[1];
            
            parseBody(req, async (body) => {
                const columns = Object.keys(body);
                const values = Object.values(body).map(v => `'${String(v).replace(/'/g, "''")}'`);
                
                const query = `INSERT INTO [${tableName}] ([${columns.join('], [')}]) VALUES (${values.join(', ')})`;
                await sql.connect(currentConfig);
                await sql.query(query);
                
                res.writeHead(201);
                res.end(JSON.stringify({ message: 'Row inserted' }));
            });
            return;
        }

        // Update row
        if (path.match(/\/api\/tables\/([^/]+)\/rows\/([^/]+)$/) && method === 'PUT') {
            const match = path.match(/\/api\/tables\/([^/]+)\/rows\/([^/]+)$/);
            const tableName = match[1];
            const rowId = match[2];
            
            parseBody(req, async (body) => {
                const sets = Object.entries(body).map(([k, v]) => `[${k}] = '${String(v).replace(/'/g, "''")}'`).join(', ');
                const query = `UPDATE [${tableName}] SET ${sets} WHERE id = ${rowId}`;
                await sql.connect(currentConfig);
                await sql.query(query);
                
                res.writeHead(200);
                res.end(JSON.stringify({ message: 'Row updated' }));
            });
            return;
        }

        // Delete row
        if (path.match(/\/api\/tables\/([^/]+)\/rows\/([^/]+)$/) && method === 'DELETE') {
            const match = path.match(/\/api\/tables\/([^/]+)\/rows\/([^/]+)$/);
            const tableName = match[1];
            const rowId = match[2];
            
            await sql.connect(currentConfig);
            await sql.query(`DELETE FROM [${tableName}] WHERE id = ${rowId}`);
            
            res.writeHead(200);
            res.end(JSON.stringify({ message: 'Row deleted' }));
            return;
        }

        // Drop table
        if (path.match(/\/api\/tables\/([^/]+)$/) && method === 'DELETE') {
            const tableName = path.match(/\/api\/tables\/([^/]+)$/)[1];
            
            await sql.connect(currentConfig);
            await sql.query(`DROP TABLE IF EXISTS [${tableName}]`);
            
            res.writeHead(200);
            res.end(JSON.stringify({ message: 'Table dropped' }));
            return;
        }

        // Execute custom SQL (ALTER TABLE, etc.)
        if (path === '/api/execute' && method === 'POST') {
            parseBody(req, async (body) => {
                const { sql_query } = body;
                await sql.connect(currentConfig);
                await sql.query(sql_query);
                
                res.writeHead(200);
                res.end(JSON.stringify({ message: 'Executed' }));
            });
            return;
        }

        // 404
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
        console.error('Error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
});

server.listen(PORT, () => {
    console.log(`MS SQL Server running on port ${PORT}`);
    console.log(`Config: ${currentConfig.server}/${currentConfig.database}`);
});
