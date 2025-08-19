const fs = require('fs')
const path = require('path')

// Read coverage summary
const coverageFile = path.join(__dirname, '../coverage/coverage-summary.json')
if (!fs.existsSync(coverageFile)) {
  console.log('No coverage data found. Run tests with coverage first.')
  process.exit(0)
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'))

// Group by module
const modules = {}
Object.entries(coverage).forEach(([file, data]) => {
  if (file === 'total') return

  const parts = file.split('/')
  let module = 'root'

  if (parts.includes('src')) {
    const srcIndex = parts.indexOf('src')
    if (parts[srcIndex + 1]) {
      module = parts[srcIndex + 1]
    }
  }

  if (!modules[module]) {
    modules[module] = {
      lines: { total: 0, covered: 0 },
      statements: { total: 0, covered: 0 },
      functions: { total: 0, covered: 0 },
      branches: { total: 0, covered: 0 },
    }
  }

  modules[module].lines.total += data.lines.total
  modules[module].lines.covered += data.lines.covered
  modules[module].statements.total += data.statements.total
  modules[module].statements.covered += data.statements.covered
  modules[module].functions.total += data.functions.total
  modules[module].functions.covered += data.functions.covered
  modules[module].branches.total += data.branches.total
  modules[module].branches.covered += data.branches.covered
})

// Calculate percentages and sort
const sortedModules = Object.entries(modules)
  .map(([name, data]) => ({
    name,
    lines: data.lines.covered / data.lines.total * 100,
    statements: data.statements.covered / data.statements.total * 100,
    functions: data.functions.covered / data.functions.total * 100,
    branches: data.branches.covered / data.branches.total * 100,
    overall: (
      data.lines.covered / data.lines.total * 100 +
      data.statements.covered / data.statements.total * 100 +
      data.functions.covered / data.functions.total * 100 +
      data.branches.covered / data.branches.total * 100
    ) / 4,
  }))
  .sort((a, b) => b.overall - a.overall)

// Display results
console.log('\n📊 Test Coverage by Module\n')
console.log('Module'.padEnd(20) + 'Lines'.padStart(10) + 'Stmts'.padStart(10) + 'Funcs'.padStart(10) + 'Branch'.padStart(10) + 'Overall'.padStart(10))
console.log('-'.repeat(70))

sortedModules.forEach(module => {
  const color = module.overall >= 80 ? '\x1b[32m' : module.overall >= 50 ? '\x1b[33m' : '\x1b[31m'
  const reset = '\x1b[0m'

  console.log(
    module.name.padEnd(20) +
    `${color}${module.lines.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${module.statements.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${module.functions.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${module.branches.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${module.overall.toFixed(1)}%${reset}`.padStart(10),
  )
})

// Overall coverage
if (coverage.total) {
  const total = coverage.total
  const overall = (
    total.lines.pct +
    total.statements.pct +
    total.functions.pct +
    total.branches.pct
  ) / 4

  console.log('-'.repeat(70))
  const color = overall >= 80 ? '\x1b[32m' : overall >= 50 ? '\x1b[33m' : '\x1b[31m'
  const reset = '\x1b[0m'
  console.log(
    'TOTAL'.padEnd(20) +
    `${color}${total.lines.pct.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${total.statements.pct.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${total.functions.pct.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${total.branches.pct.toFixed(1)}%${reset}`.padStart(10) +
    `${color}${overall.toFixed(1)}%${reset}`.padStart(10),
  )
}

console.log('\n✅ Coverage report generated successfully!')
