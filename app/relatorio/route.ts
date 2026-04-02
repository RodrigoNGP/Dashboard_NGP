import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export function GET() {
  const html = readFileSync(join(process.cwd(), 'public', 'relatorio-static.html'), 'utf-8')
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
