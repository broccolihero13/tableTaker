const { parseCSVLine, getTableData, formatAsJSON, formatAsTSV } = require('../src/js/content.js');

describe('parseCSVLine', () => {
  test('parses simple csv line', () => {
    expect(parseCSVLine('A,B,C')).toEqual(['A', 'B', 'C']);
  });
  
  test('parses quotes containing commas', () => {
    expect(parseCSVLine('A,"B,C",D')).toEqual(['A', 'B,C', 'D']);
  });
  
  test('parses escaped quotes', () => {
    expect(parseCSVLine('A,"B""C",D')).toEqual(['A', 'B"C', 'D']);
  });
});

describe('getTableData', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('extracts basic table data', () => {
    document.body.innerHTML = `
      <table>
        <tr><th>Col1</th><th>Col2</th></tr>
        <tr><td>Val1</td><td>Val2</td></tr>
      </table>
    `;
    const table = document.querySelector('table');
    const data = getTableData(table);
    expect(data).toEqual([
      ['Col1', 'Col2'],
      ['Val1', 'Val2']
    ]);
  });

  test('extracts values from inputs, textareas, and selects', () => {
    document.body.innerHTML = `
      <table>
        <tr><th>Col1</th><th>Col2</th><th>Col3</th></tr>
        <tr>
          <td><input type="text" value="InputVal"></td>
          <td><textarea>TextareaVal</textarea></td>
          <td>
            <select>
              <option value="1">Opt1</option>
              <option value="2" selected>Opt2</option>
            </select>
          </td>
        </tr>
      </table>
    `;
    const table = document.querySelector('table');
    const data = getTableData(table);
    expect(data).toEqual([
      ['Col1', 'Col2', 'Col3'],
      ['InputVal', 'TextareaVal', 'Opt2']
    ]);
  });

  test('extracts checkboxes correctly', () => {
    document.body.innerHTML = `
      <table>
        <tr>
          <td><input type="checkbox" checked></td>
          <td><input type="checkbox"></td>
        </tr>
      </table>
    `;
    const table = document.querySelector('table');
    const data = getTableData(table);
    expect(data).toEqual([
      ['Yes', 'No']
    ]);
  });

  test('skips intermediate header rows but keeps the first one', () => {
    document.body.innerHTML = `
      <table>
        <tr><th>First</th><th>Header</th></tr>
        <tr><td>Data</td><td>1</td></tr>
        <tr><th>Intermediate</th><th>Header</th></tr>
        <tr><td>Data</td><td>2</td></tr>
      </table>
    `;
    const table = document.querySelector('table');
    const data = getTableData(table);
    expect(data).toEqual([
      ['First', 'Header'],
      ['Data', '1'],
      ['Data', '2']
    ]);
  });
});

describe('Format Generators', () => {
  const sampleData = [
    ['Name', 'Age'],
    ['Alice', '30'],
    ['Bob', '25']
  ];

  test('formatAsJSON generates correct JSON', () => {
    const jsonStr = formatAsJSON(sampleData);
    const parsed = JSON.parse(jsonStr);
    expect(parsed).toEqual([
      { Name: 'Alice', Age: '30' },
      { Name: 'Bob', Age: '25' }
    ]);
  });

  test('formatAsTSV generates correct TSV', () => {
    const tsvStr = formatAsTSV(sampleData);
    expect(tsvStr).toBe('Name\tAge\nAlice\t30\nBob\t25');
  });

  test('formatAsJSON handles missing columns gracefully', () => {
    const unevenData = [
      ['Name', 'Age'],
      ['Alice'], // Missing Age
      ['Bob', '25', 'Extra'] // Extra column
    ];
    const jsonStr = formatAsJSON(unevenData);
    const parsed = JSON.parse(jsonStr);
    expect(parsed).toEqual([
      { Name: 'Alice' },
      { Name: 'Bob', Age: '25', Column2: 'Extra' }
    ]);
  });
});
