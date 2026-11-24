/*
 * Recovery for the MAIN ADMIN ACCOUNT only — run ON THE SERVER, from the project folder (needs the database settings in .env).
 * The main admin = the first back-office account ever created (the oldest one still existing). Every other account resets
 * its password through the back office (an owner approves the request).
 *
 *   pnpm admin:reset-password                 show which account is the main admin
 *   pnpm admin:reset-password <email>         type a new password (asked twice, hidden)
 *   pnpm admin:reset-password <email> --generate   print a random temporary password instead
 *
 * It also unlocks the account (after too many wrong passwords), makes sure it still has the owner role,
 * and cancels any open reset request for it.
 */
import { randomBytes } from 'crypto'
import readline from 'readline'

process.env.OC_AUTO_SEED = 'false' // don't run the content seed for a one-off command

const args = process.argv.slice(2)
const flag = (f: string) => args.includes(f)
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase()

function out(msg = '') {
  process.stdout.write(msg + '\n')
}
function fail(msg: string): never {
  process.stderr.write('\n✖ ' + msg + '\n\n')
  process.exit(1)
}

/** Read a line without showing what is typed. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })
    let asked = false
    write._writeToOutput = (s: string) => {
      if (!asked) { process.stdout.write(s); asked = true } // the question itself
      else if (s.includes('\n') || s.includes('\r')) process.stdout.write('\n')
    }
    rl.question(question, (answer) => { rl.close(); resolve(answer) })
  })
}

async function main() {
  if (flag('--help') || flag('-h')) {
    out('\nMain admin account recovery\n')
    out('  pnpm admin:reset-password                       show which account is the main admin')
    out('  pnpm admin:reset-password <email>               choose a new password (hidden input)')
    out('  pnpm admin:reset-password <email> --generate    print a random temporary password\n')
    out('  Only the main admin (the first account created) can be reset here.')
    out('  Other accounts: "Forgot your password?" on the sign-in page, then an owner approves.\n')
    return
  }

  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })

  // the main admin = the oldest back-office account
  const first = await payload.find({ collection: 'users', sort: 'createdAt', limit: 1, depth: 0, overrideAccess: true })
  const user = first.docs[0]
  if (!user) fail('There is no back-office account yet. Open /admin/login to create the owner account.')

  if (!email) {
    out(`\nMain admin account: ${user.email}${user.name ? ` (${user.name})` : ''}, created ${new Date(user.createdAt).toISOString().slice(0, 10)}`)
    out(`Reset it with:  pnpm admin:reset-password ${user.email}\n`)
    return
  }
  if (user.email.toLowerCase() !== email) {
    fail(`"${email}" is not the main admin account. Only the main admin can be reset from the server.\n  Other accounts: use "Forgot your password?" on the sign-in page; an owner approves the request.`)
  }

  let password: string
  if (flag('--generate')) {
    password = randomBytes(12).toString('base64url')
  } else {
    if (!process.stdin.isTTY) fail('No terminal to type the password in. Use --generate instead.')
    password = await askHidden(`New password for ${user.email}: `)
    if (password.length < 8) fail('Use at least 8 characters.')
    const again = await askHidden('Type it again: ')
    if (again !== password) fail('The two passwords are different. Nothing was changed.')
  }

  // the main admin always keeps the owner role (it is the account that can recover everything else)
  const roles = new Set(user.roles || [])
  roles.add('owner')
  await payload.update({ collection: 'users', id: user.id, data: { password, roles: [...roles] as never }, overrideAccess: true, context: { mainAdminRecovery: true } })
  try {
    await payload.unlock({ collection: 'users', data: { email: user.email } as never, overrideAccess: true })
  } catch {}
  const open = await payload.update({
    collection: 'password-resets',
    where: { and: [{ kind: { equals: 'staff' } }, { email: { equals: user.email } }, { status: { in: ['pending', 'approved'] } }] },
    data: { status: 'expired' },
    overrideAccess: true,
  })

  out(`\n✔ Password changed for the main admin, ${user.email}. The account is unlocked and is an owner.`)
  if (open.docs.length) out(`  ${open.docs.length} open reset request(s) for this account were cancelled.`)
  if (flag('--generate')) {
    out(`\n  Temporary password:  ${password}\n`)
    out('  Give it to the person privately. They should change it after signing in (account menu → Account settings).')
  }
  out(`  Sign in at ${(process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/+$/, '')}/admin/login\n`)
}

main().then(
  () => process.exit(0),
  (e) => fail(e instanceof Error ? e.message : String(e)),
)
