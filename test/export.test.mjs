import test from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from '../src/export.mjs'

test('CSV 表头与基本行', () => {
  const csv = toCsv([{ t: 1700000000000, currency: 'CNY', balance: 12.3, total: 12.3, reserved: 0, granted: 2 }])
  const [header, row] = csv.trim().split('\n')
  assert.equal(header, 'time,timestamp,currency,balance,total,reserved,granted')
  assert.match(row, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, '时间列是 ISO 格式，Excel 可直接识别')
  assert.ok(row.includes('1700000000000,CNY,12.3,12.3,0,2'))
})

test('含逗号/引号的字段被正确转义', () => {
  const csv = toCsv([{ t: 1, currency: 'a,b', balance: 1 }])
  assert.ok(csv.includes('"a,b"'))
})

test('空值输出为空单元格', () => {
  const csv = toCsv([{ t: 1 }])
  assert.equal(csv.trim().split('\n')[1], `${new Date(1).toISOString()},1,,,,,`)
})
