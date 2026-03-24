const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const url = require('url');

const PORT = process.env.PORT || 3000;

const SQLITE_DB_PATH = 'C:\\Users\\pavel\\Downloads\\sqlite_database.db';

let sqliteDb = null;

function getSqliteDb() {
    if (!sqliteDb) {
        sqliteDb = new sqlite3.Database(SQLITE_DB_PATH, (err) => {
            if (err) {
                console.error('SQLite connection error:', err.message);
            } else {
                console.log('Connected to SQLite database:', SQLITE_DB_PATH);
            }
        });
    }
    return sqliteDb;
}

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

function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
}

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
        // Health check
        if (path === '/api/sqlite/health' && method === 'GET') {
            const db = getSqliteDb();
            db.get('SELECT 1', (err) => {
                if (err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                } else {
                    res.writeHead(200);
                    res.end(JSON.stringify({ status: 'ok', connected: true, database: SQLITE_DB_PATH }));
                }
            });
            return;
        }

        // List all tables
        if (path === '/api/sqlite/tables' && method === 'GET') {
            const db = getSqliteDb();
            db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, tables) => {
                if (err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                }
                
                const tablePromises = tables.map(table => {
                    return new Promise((resolve) => {
                        db.all(`PRAGMA table_info(${table.name})`, [], (err2, columns) => {
                            if (err2) {
                                resolve({ table_name: table.name, columns: [] });
                            } else {
                                resolve({ 
                                    table_name: table.name, 
                                    columns: columns.map(c => ({ column_name: c.name, data_type: c.type })) 
                                });
                            }
                        });
                    });
                });

                Promise.all(tablePromises).then(results => {
                    res.writeHead(200);
                    res.end(JSON.stringify(results));
                });
            });
            return;
        }

        // Get table data
        if (path.match(/\/api\/sqlite\/tables\/([^/]+)$/) && method === 'GET') {
            const tableName = path.match(/\/api\/sqlite\/tables\/([^/]+)$/)[1];
            const limit = parsedUrl.query.limit || 100;
            const db = getSqliteDb();
            
            db.all(`SELECT * FROM "${tableName}" LIMIT ?`, [parseInt(limit)], (err, rows) => {
                if (err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                }
                res.writeHead(200);
                res.end(JSON.stringify(rows));
            });
            return;
        }

        // Create table
        if (path === '/api/sqlite/tables' && method === 'POST') {
            parseBody(req, async (body) => {
                const { tableName, columns } = body;
                const db = getSqliteDb();
                
                const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ');
                const query = `CREATE TABLE IF NOT EXISTS "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columnDefs}, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`;
                
                db.run(query, function(err) {
                    if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(201);
                        res.end(JSON.stringify({ message: 'Table created' }));
                    }
                });
            });
            return;
        }

        // Insert row
        if (path.match(/\/api\/sqlite\/tables\/([^/]+)\/rows$/) && method === 'POST') {
            const tableName = path.match(/\/api\/sqlite\/tables\/([^/]+)\/rows$/)[1];
            
            parseBody(req, async (body) => {
                const db = getSqliteDb();
                const columns = Object.keys(body);
                const values = Object.values(body).map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v);
                
                const query = `INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES (${values.join(', ')})`;
                db.run(query, function(err) {
                    if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(201);
                        res.end(JSON.stringify({ message: 'Row inserted', id: this.lastID }));
                    }
                });
            });
            return;
        }

        // Update row
        if (path.match(/\/api\/sqlite\/tables\/([^/]+)\/rows\/([^/]+)$/) && method === 'PUT') {
            const match = path.match(/\/api\/sqlite\/tables\/([^/]+)\/rows\/([^/]+)$/);
            const tableName = match[1];
            const rowId = match[2];
            
            parseBody(req, async (body) => {
                const db = getSqliteDb();
                const sets = Object.entries(body).map(([k, v]) => `"${k}" = '${String(v).replace(/'/g, "''")}'`).join(', ');
                const query = `UPDATE "${tableName}" SET ${sets} WHERE id = ${rowId}`;
                db.run(query, function(err) {
                    if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ message: 'Row updated' }));
                    }
                });
            });
            return;
        }

        // Delete row
        if (path.match(/\/api\/sqlite\/tables\/([^/]+)\/rows\/([^/]+)$/) && method === 'DELETE') {
            const match = path.match(/\/api\/sqlite\/tables\/([^/]+)\/rows\/([^/]+)$/);
            const tableName = match[1];
            const rowId = match[2];
            
            const db = getSqliteDb();
            db.run(`DELETE FROM "${tableName}" WHERE id = ?`, [rowId], function(err) {
                if (err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                } else {
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Row deleted' }));
                }
            });
            return;
        }

        // Drop table
        if (path.match(/\/api\/sqlite\/tables\/([^/]+)$/) && method === 'DELETE') {
            const tableName = path.match(/\/api\/sqlite\/tables\/([^/]+)$/)[1];
            
            const db = getSqliteDb();
            db.run(`DROP TABLE IF EXISTS "${tableName}"`, function(err) {
                if (err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: err.message }));
                } else {
                    res.writeHead(200);
                    res.end(JSON.stringify({ message: 'Table dropped' }));
                }
            });
            return;
        }

        // Add column
        if (path.match(/\/api\/sqlite\/tables\/([^/]+)\/columns$/) && method === 'POST') {
            const match = path.match(/\/api\/sqlite\/tables\/([^/]+)\/columns$/);
            const tableName = match[1];
            
            parseBody(req, async (body) => {
                const { columnName } = body;
                const db = getSqliteDb();
                const query = `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" TEXT`;
                db.run(query, function(err) {
                    if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(201);
                        res.end(JSON.stringify({ message: 'Column added' }));
                    }
                });
            });
            return;
        }

        // Execute custom SQL
        if (path === '/api/sqlite/execute' && method === 'POST') {
            parseBody(req, async (body) => {
                const { sql_query } = body;
                const db = getSqliteDb();
                db.run(sql_query, function(err) {
                    if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ message: 'Executed', changes: this.changes }));
                    }
                });
            });
            return;
        }

        // 404
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
        console.error('Error:', error.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
});

server.listen(PORT, () => {
    console.log(`SQLite server running on port ${PORT}`);
    console.log(`Database: ${SQLITE_DB_PATH}`);
});
