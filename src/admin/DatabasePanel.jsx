import { useState } from 'react'
import { adminApi } from '../adminApi'
import { Badge, DataTable, ErrorText, Modal, PAGE_SIZE, Pager, Stat, useLoad } from './ui'

const REFRESH_MS = 30000

const formatSize = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`)

export default function DatabasePanel() {
  const [live, setLive] = useState(true)
  const [openTable, setOpenTable] = useState(null)
  const info = useLoad(() => adminApi.databaseInfo(), [], live ? REFRESH_MS : 0)
  const tables = useLoad(() => adminApi.databaseTables(), [], live ? REFRESH_MS : 0)

  const db = info.data
  const latencyTone = !db ? 'neutral' : db.latency_ms < 300 ? 'green' : db.latency_ms < 1000 ? 'amber' : 'red'

  return (
    <>
      <div className="admin-toolbar">
        <span className="spacer" />
        <label className="admin-live">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Auto-refresh (30 s)
        </label>
        <button
          className="admin-btn"
          type="button"
          onClick={() => {
            info.reload()
            tables.reload()
          }}
        >
          Refresh
        </button>
      </div>
      <ErrorText>{info.error || tables.error}</ErrorText>

      {db && (
        <>
          <div className="admin-stats">
            <Stat label="Status" value={db.status.toUpperCase()} tone="completed" />
            <Stat label="Latency" value={`${db.latency_ms} ms`} />
            <Stat label="Size" value={db.size_mb == null ? '—' : `${db.size_mb} MB`} />
            <Stat label="Tables" value={db.table_count} />
            <Stat label="Sessions" value={db.active_sessions} />
          </div>
          <div className="admin-card" style={{ marginBottom: 24 }}>
            <h3>
              Connection <Badge tone={latencyTone}>{db.latency_ms} ms</Badge>
            </h3>
            <dl className="admin-kv" style={{ marginBottom: 0 }}>
              <dt>Database</dt>
              <dd>{db.database ?? '—'}</dd>
              <dt>Server</dt>
              <dd>{db.server ?? '—'}</dd>
              <dt>Engine</dt>
              <dd>{db.version ?? '—'}</dd>
              <dt>Environment</dt>
              <dd>{db.environment}</dd>
              <dt>API connection pool</dt>
              <dd>
                {db.pool.checked_out ?? '—'} in use of {db.pool.size ?? '—'} (overflow {db.pool.overflow ?? '—'})
              </dd>
            </dl>
          </div>
        </>
      )}

      <h3 style={{ margin: '0 0 12px', fontWeight: 500 }}>Tables</h3>
      <DataTable
        columns={[
          { label: 'Table', render: (t) => <strong>{`${t.schema}.${t.table}`}</strong> },
          { label: 'Rows', render: (t) => t.rows },
          { label: 'Size', render: (t) => formatSize(t.size_kb) },
          {
            label: '',
            render: (t) => (
              <div className="actions">
                <button className="admin-btn small" type="button" onClick={() => setOpenTable(t)}>
                  Browse
                </button>
              </div>
            ),
          },
        ]}
        rows={tables.data ?? []}
        rowKey={(t) => `${t.schema}.${t.table}`}
        onRowClick={setOpenTable}
        empty="No tables"
      />

      {openTable && <TableViewer table={openTable} onClose={() => setOpenTable(null)} />}
    </>
  )
}

function TableViewer({ table, onClose }) {
  const [offset, setOffset] = useState(0)
  const { data, error } = useLoad(
    () => adminApi.tableData(table.schema, table.table, { limit: PAGE_SIZE, offset }),
    [table.schema, table.table, offset],
  )

  return (
    <Modal title={`${table.schema}.${table.table}`} onClose={onClose} wide>
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          <p className="admin-muted" style={{ marginTop: 0 }}>
            {data.total} rows · {data.columns.length} columns · read-only
            {data.hidden_columns.length > 0 && ` · hidden: ${data.hidden_columns.join(', ')}`}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {data.columns.map((column) => (
                    <th key={column.name} title={`${column.type}${column.nullable ? ', nullable' : ''}`}>
                      {column.name}
                      <div className="admin-mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {column.type}
                        {column.max_length > 0 ? `(${column.max_length})` : ''}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td className="admin-empty" colSpan={data.columns.length}>
                      Empty table
                    </td>
                  </tr>
                )}
                {data.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((value, cell) => (
                      <td key={cell} className="admin-mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(value ?? '')}>
                        {value === null ? <span className="admin-muted">NULL</span> : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} offset={offset} onChange={setOffset} />
        </>
      )}
    </Modal>
  )
}
