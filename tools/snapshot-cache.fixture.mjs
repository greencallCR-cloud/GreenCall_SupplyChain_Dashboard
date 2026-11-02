// Synthetic contract fixture (not operational data).
export const fixtureData = () => {
  const tables = {
    google_consumos: [{ order: 'TEST-1', sku: 'TEST-M', quantity: 3, date: '2026-09-01', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 2 }],
    sku_catalog: [{ sku: 'TEST-M', description: 'Synthetic', cost: 4, unit: 'M', center: 'C', warehouse: 'W' }],
  };
  return { tables, sources: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, { source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: t === 'google_consumos' ? 'Consumos' : 'Catálogo SKUs', original_data_rows: rows.length, retrieved_at: '2026-10-30T12:00:00.000Z', sanitized: true }])) };
};
