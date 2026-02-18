// Database client abstraction layer
// Supports both Supabase and Local MS SQL Server backends

class DatabaseClient {
    constructor() {
        this.mode = null; // 'supabase' or 'mssql'
        this.supabaseClient = null;
        this.mssqlBaseUrl = 'http://localhost:3000';
    }

    // Initialize based on stored settings
    initialize() {
        this.mode = localStorage.getItem('db_mode') || 'supabase';
        
        if (this.mode === 'supabase') {
            const url = localStorage.getItem('supabase_url');
            const key = localStorage.getItem('supabase_key');
            if (url && key && typeof supabase !== 'undefined') {
                this.supabaseClient = supabase.createClient(url, key);
                return true;
            }
            return false;
        } else if (this.mode === 'mssql') {
            this.mssqlBaseUrl = localStorage.getItem('mssql_url') || 'http://localhost:3000';
            return true;
        }
        return false;
    }

    // Check if connected
    isConnected() {
        if (this.mode === 'supabase') {
            return this.supabaseClient !== null;
        } else if (this.mode === 'mssql') {
            return this.mssqlBaseUrl !== null;
        }
        return false;
    }

    // Send credentials to server (for MSSQL mode)
    async sendCredentialsToServer() {
        const server = localStorage.getItem('mssql_server') || 'localhost';
        const port = localStorage.getItem('mssql_port') || '1433';
        const database = localStorage.getItem('mssql_database') || 'test';
        const user = localStorage.getItem('mssql_user') || 'sa';
        const password = localStorage.getItem('mssql_password') || '';

        if (!password) return false;

        try {
            const response = await fetch(`${this.mssqlBaseUrl}/api/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server: server,
                    port: parseInt(port),
                    database: database,
                    user: user,
                    password: password
                })
            });
            return response.ok;
        } catch (e) {
            console.error('Failed to send credentials to server:', e);
            return false;
        }
    }

    // Get current mode
    getMode() {
        return this.mode;
    }

    // Set mode and reinitialize
    setMode(mode, config = {}) {
        this.mode = mode;
        localStorage.setItem('db_mode', mode);
        
        if (mode === 'supabase') {
            if (config.url && config.key) {
                localStorage.setItem('supabase_url', config.url);
                localStorage.setItem('supabase_key', config.key);
                this.supabaseClient = supabase.createClient(config.url, config.key);
            }
        } else if (mode === 'mssql') {
            if (config.url) {
                this.mssqlBaseUrl = config.url;
                localStorage.setItem('mssql_url', config.url);
            }
        }
    }

    // =====================
    // MS SQL HTTP Helpers
    // =====================
    async mssqlRequest(endpoint, method = 'GET', body = null) {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${this.mssqlBaseUrl}${endpoint}`, options);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    // =====================
    // Tables Operations
    // =====================
    async getTables() {
        if (this.mode === 'supabase') {
            const { data, error } = await this.supabaseClient.rpc('get_user_tables', {});
            if (error) throw error;
            return data || [];
        } else {
            return await this.mssqlRequest('/api/tables');
        }
    }

    async createTable(tableName, columns) {
        if (this.mode === 'supabase') {
            const columnDefs = columns.map(col => `${col} TEXT`).join(', ');
            const sql = `
                CREATE TABLE ${tableName} (
                    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    ${columnDefs},
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
                );
            `;
            const { error } = await this.supabaseClient.rpc('execute_sql', { sql_query: sql });
            if (error) throw error;
        } else {
            await this.mssqlRequest('/api/tables', 'POST', { tableName, columns });
        }
    }

    async createTableFromData(tableName, headers, data) {
        const sanitizedColumns = headers.map(col => {
            const sanitized = col.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            return { original: col, sanitized: sanitized || 'column' };
        });

        if (this.mode === 'supabase') {
            const columnDefs = sanitizedColumns.map(col => `${col.sanitized} TEXT`).join(', ');
            const sql = `CREATE TABLE ${tableName} (id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, ${columnDefs}, created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()))`;
            
            const { error: createError } = await this.supabaseClient.rpc('execute_sql', { sql_query: sql });
            if (createError) throw createError;

            // Insert data in batches
            const batchSize = 50;
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, i + batchSize);
                const rows = batch.map(row => {
                    const obj = {};
                    sanitizedColumns.forEach(col => {
                        obj[col.sanitized] = row[col.original] || '';
                    });
                    return obj;
                });
                
                const { error: insertError } = await this.supabaseClient.from(tableName).insert(rows);
                if (insertError) throw insertError;
            }
        } else {
            // MS SQL
            await this.mssqlRequest('/api/tables', 'POST', { 
                tableName, 
                columns: sanitizedColumns.map(c => c.sanitized) 
            });

            // Insert data in batches
            const batchSize = 50;
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, i + batchSize);
                for (const row of batch) {
                    const rowData = {};
                    sanitizedColumns.forEach(col => {
                        rowData[col.sanitized] = row[col.original] || '';
                    });
                    await this.mssqlRequest(`/api/tables/${tableName}/rows`, 'POST', rowData);
                }
            }
        }
    }

    async deleteTable(tableName) {
        if (this.mode === 'supabase') {
            const sql = `DROP TABLE IF EXISTS ${tableName};`;
            const { error } = await this.supabaseClient.rpc('execute_sql', { sql_query: sql });
            if (error) throw error;
        } else {
            await this.mssqlRequest(`/api/tables/${tableName}`, 'DELETE');
        }
    }

    // =====================
    // Table Data Operations
    // =====================
    async getTableData(tableName, limit = 100) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.supabaseClient
                .from(tableName)
                .select('*')
                .order('created_at', { ascending: true })
                .limit(limit);
            if (error) throw error;
            return data || [];
        } else {
            return await this.mssqlRequest(`/api/tables/${tableName}?limit=${limit}`);
        }
    }

    async getRowCount(tableName) {
        if (this.mode === 'supabase') {
            const { count, error } = await this.supabaseClient
                .from(tableName)
                .select('*', { count: 'exact', head: true });
            if (error) throw error;
            return count;
        } else {
            const data = await this.mssqlRequest(`/api/tables/${tableName}?limit=1000`);
            return data.length;
        }
    }

    // =====================
    // Row Operations
    // =====================
    async insertRow(tableName, data) {
        if (this.mode === 'supabase') {
            const { error } = await this.supabaseClient.from(tableName).insert([data]);
            if (error) throw error;
        } else {
            await this.mssqlRequest(`/api/tables/${tableName}/rows`, 'POST', data);
        }
    }

    async updateRow(tableName, rowId, data) {
        if (this.mode === 'supabase') {
            const { error } = await this.supabaseClient
                .from(tableName)
                .update(data)
                .eq('id', rowId);
            if (error) throw error;
        } else {
            await this.mssqlRequest(`/api/tables/${tableName}/rows/${rowId}`, 'PUT', data);
        }
    }

    async deleteRow(tableName, rowId) {
        if (this.mode === 'supabase') {
            const { error } = await this.supabaseClient
                .from(tableName)
                .delete()
                .eq('id', rowId);
            if (error) throw error;
        } else {
            await this.mssqlRequest(`/api/tables/${tableName}/rows/${rowId}`, 'DELETE');
        }
    }

    async getRow(tableName, rowId) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.supabaseClient
                .from(tableName)
                .select('*')
                .eq('id', rowId)
                .single();
            if (error) throw error;
            return data;
        } else {
            const data = await this.mssqlRequest(`/api/tables/${tableName}?limit=1000`);
            return data.find(row => String(row.id) === String(rowId));
        }
    }

    // =====================
    // Column Operations
    // =====================
    async addColumn(tableName, columnName) {
        if (this.mode === 'supabase') {
            const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT;`;
            const { error } = await this.supabaseClient.rpc('execute_sql', { sql_query: sql });
            if (error) throw error;
        } else {
            const sql_query = `ALTER TABLE [${tableName}] ADD [${columnName}] NVARCHAR(MAX)`;
            await this.mssqlRequest('/api/execute', 'POST', { sql_query });
        }
    }

    async deleteColumn(tableName, columnName) {
        if (this.mode === 'supabase') {
            const sql = `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`;
            const { error } = await this.supabaseClient.rpc('execute_sql', { sql_query: sql });
            if (error) throw error;
        } else {
            const sql_query = `ALTER TABLE [${tableName}] DROP COLUMN [${columnName}]`;
            await this.mssqlRequest('/api/execute', 'POST', { sql_query });
        }
    }

    // =====================
    // Health Check
    // =====================
    async checkConnection() {
        if (this.mode === 'supabase') {
            try {
                // Try to get tables using the RPC function - if this works, we're connected
                await this.getTables();
                return true;
            } catch (e) {
                return false;
            }
        } else {
            try {
                await this.mssqlRequest('/api/health');
                return true;
            } catch (e) {
                return false;
            }
        }
    }
}

// Export singleton instance
const dbClient = new DatabaseClient();
