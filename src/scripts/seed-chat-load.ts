/*
 * Load-test data for the chat: lots of messages in the lounge and in every active group, to try pagination, scrolling,
 * unread counts… on a realistic volume. Run from the project folder (needs the database settings in .env):
 *
 *   pnpm seed:chat-load                  add it (≈ 3000 lounge messages, ≈ 1500 per group, 24 "seed fan" accounts)
 *   pnpm seed:chat-load --lounge 5000 --group 2000
 *   pnpm seed:chat-load --remove         remove everything it added (messages + seed fan accounts)
 *
 * Everything it adds is tagged: messages have clientId "seed-load-…", accounts have e-mails seed-fan-NN@oddsclub.test.
 * Messages are written straight to the database (no live broadcast): open chats see them after a reload.
 * Group messages are written by that group's real members (+ the team account that made it), so memberships don't change.
 */
import { randomBytes } from 'node:crypto'

/** a MongoDB-style id (time + random), as a string — the database layer turns it into an ObjectId */
const oid = (t = Date.now()) => Math.floor(t / 1000).toString(16).padStart(8, '0') + randomBytes(8).toString('hex')

const arg = (name: string, def: number) => { const i = process.argv.indexOf('--' + name); const n = i > 0 ? Number(process.argv[i + 1]) : NaN; return Number.isFinite(n) && n > 0 ? Math.min(20000, Math.floor(n)) : def }
const REMOVE = process.argv.includes('--remove')
const LOUNGE = arg('lounge', 3000), PER_GROUP = arg('group', 1500), FANS = 24, DAYS = 30

const FIRST = ['Amara', 'Bastien', 'Chloé', 'Diego', 'Emeka', 'Fatou', 'Gaspard', 'Hana', 'Ibrahim', 'Jules', 'Kofi', 'Léa', 'Moussa', 'Nadia', 'Olivier', 'Priya', 'Quentin', 'Rania', 'Sékou', 'Thiago', 'Ugo', 'Victoria', 'Wassim', 'Yasmine']
const TEAMS = ['Arsenal', 'Barça', 'Real', 'PSG', 'Bayern', 'Inter', 'Milan', 'Liverpool', 'City', 'Dortmund', 'Napoli', 'Benfica', 'Ajax', 'Marseille', 'Lyon', 'Chelsea', 'Juve', 'Atlético']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const LINES: (() => string)[] = [
  () => `${pick(TEAMS)} look sharp tonight 🔥`,
  () => `Anyone watching ${pick(TEAMS)} vs ${pick(TEAMS)}?`,
  () => `That was never a penalty 😤`,
  () => `What a goal!! ⚽⚽`,
  () => `Over 2.5 goals feels safe for this one`,
  () => `${pick(TEAMS)} defence is all over the place`,
  () => `Half time ${Math.floor(Math.random() * 3)}-${Math.floor(Math.random() * 3)}, still all to play for`,
  () => `Both teams to score? I'm in 👍`,
  () => `The keeper saved them again`,
  () => `Red card!! Game changer`,
  () => `Who do you back this weekend?`,
  () => `${pick(TEAMS)} away form is terrible lately`,
  () => `Lineups are out, no ${pick(['striker', 'captain', 'number 10'])} for ${pick(TEAMS)}`,
  () => `VAR again… 🙄`,
  () => `Easy win for ${pick(TEAMS)} I think`,
  () => `Corners market looks interesting tonight`,
  () => `Good morning everyone ☀️`,
  () => `Thanks for the tip yesterday 🙏`,
  () => `Late goal!! Unbelievable`,
  () => `I'll wait for the first 15 minutes before deciding`,
  () => `${pick(TEAMS)} have scored in their last ${2 + Math.floor(Math.random() * 8)} games`,
  () => `Draw no bet on ${pick(TEAMS)}?`,
  () => `Quel match ce soir 😍`,
  () => `Allez ${pick(TEAMS)} !!`,
  () => `Pas de chance sur la fin…`,
  () => `On se retrouve pour le match de dimanche ?`,
  () => `${pick(TEAMS)} ${pick(['dominate', 'struggle', 'look tired', 'press high'])} in the second half`,
  () => `lol 😂`,
  () => `Agreed 💯`,
  () => `No way, ${pick(TEAMS)} will bounce back`,
]
const SHORT = ['👍', '😂', '🔥', 'Yes!', 'No way', 'Exactly', 'Haha', 'True', '⚽', 'Same', 'Let’s go!', '😅']

const run = async () => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Messages = (payload.db as any).collections['chat-messages']

  if (REMOVE) {
    const r = await Messages.deleteMany({ clientId: { $regex: '^seed-load-' } })
    const fans = await payload.find({ collection: 'members', where: { email: { like: '@oddsclub.test' } }, pagination: false, depth: 0, overrideAccess: true })
    const seedFans = fans.docs.filter((m) => /^seed-fan-\d+@oddsclub\.test$/.test(String(m.email)))
    for (const m of seedFans) {
      await payload.delete({ collection: 'chat-room-members', where: { member: { equals: m.id } }, overrideAccess: true })
      await payload.delete({ collection: 'members', id: m.id, overrideAccess: true })
    }
    console.log(`Removed ${r.deletedCount} seeded messages and ${seedFans.length} seed fan accounts.`)
    return
  }

  // the seed fans (reused if they already exist)
  const fans: string[] = []
  for (let i = 0; i < FANS; i++) {
    const email = `seed-fan-${String(i + 1).padStart(2, '0')}@oddsclub.test`
    const found = await payload.find({ collection: 'members', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
    const m = found.docs[0] || await payload.create({ collection: 'members', overrideAccess: true, data: { displayName: `${FIRST[i]} ${String.fromCharCode(65 + (i * 7) % 26)}.`, email, password: 'Seed-fan-' + Math.random().toString(36).slice(2), avatarGradient: 'g' + ((i % 6) + 1), rulesAcceptedAt: new Date().toISOString() } as never })
    fans.push(String(m.id))
  }
  const team = (await payload.find({ collection: 'users', pagination: false, depth: 0, overrideAccess: true })).docs.map((u) => String(u.id))

  let seq = 0
  /** n messages in `room` by these people (staff ids marked), spread over the last DAYS days, with replies and bursts */
  async function fill(room: string, n: number, people: { id: string; staff: boolean }[]) {
    if (!people.length || n <= 0) return 0
    const end = Date.now() - 60_000, start = end - DAYS * 86_400_000
    // times: random over the period, sorted, with some quick back-and-forth bursts
    const times: number[] = []
    while (times.length < n) {
      const t = start + Math.random() * (end - start)
      const burst = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 6) : 1
      for (let k = 0; k < burst && times.length < n; k++) times.push(t + k * (8_000 + Math.random() * 50_000))
    }
    times.sort((a, b) => a - b)
    const docs: Record<string, unknown>[] = []
    let prevBy = ''
    for (let i = 0; i < n; i++) {
      // the same person rarely writes many in a row
      let p = pick(people); if (p.id === prevBy && people.length > 1 && Math.random() < 0.6) p = pick(people.filter((x) => x.id !== prevBy))
      prevBy = p.id
      const text = Math.random() < 0.15 ? pick(SHORT) : pick(LINES)()
      const at = new Date(Math.min(end, times[i])), _id = oid(at.getTime())
      const doc: Record<string, unknown> = { _id, createdAt: at, updatedAt: at, room, text, clientId: 'seed-load-' + (++seq) + '-' + Math.random().toString(36).slice(2, 7), deleted: false, reply: {}, ...(p.staff ? { staffAuthor: p.id, isMod: true } : { author: p.id }) }
      if (docs.length > 5 && Math.random() < 0.12) {   // a reply to one of the last few messages
        const q = docs[docs.length - 1 - Math.floor(Math.random() * Math.min(6, docs.length))]
        doc.reply = { msgId: String(q._id), by: String(q.author || q.staffAuthor), text: String(q.text).slice(0, 140) }
      }
      docs.push(doc)
    }
    // written straight to the database (no hooks): encrypt the texts like the chat does
    const { encryptText } = await import('../chat/crypto')
    for (const d of docs) { d.text = await encryptText(payload, room, d.text); const r = d.reply as { text?: string }; if (r && r.text) r.text = (await encryptText(payload, room, r.text)) as string }
    for (let i = 0; i < docs.length; i += 500) await Messages.insertMany(docs.slice(i, i + 500), { ordered: false })
    return docs.length
  }

  // lounge: about a quarter from the team, the rest from the seed fans
  const teamW = team.length ? Array.from({ length: 6 }, (_, i) => ({ id: team[i % team.length], staff: true })) : []
  const lounge = await fill('lounge', LOUNGE, [...teamW, ...fans.slice(0, 18).map((id) => ({ id, staff: false }))])
  console.log(`Lounge: ${lounge} messages`)
  const rooms = await payload.find({ collection: 'chat-rooms', where: { active: { equals: true } }, pagination: false, depth: 0, overrideAccess: true })
  for (const r of rooms.docs) {
    const ms = await payload.find({ collection: 'chat-room-members', where: { and: [{ room: { equals: r.id } }, { status: { equals: 'member' } }] }, pagination: false, depth: 0, overrideAccess: true })
    const people = ms.docs.map((d) => ({ id: String(typeof d.member === 'object' ? (d.member as { id: string }).id : d.member), staff: false }))
    if (!r.owner && r.createdBy) people.push({ id: String(typeof r.createdBy === 'object' ? (r.createdBy as { id: string }).id : r.createdBy), staff: true })
    // a channel: only its admins / the team post
    const writers = r.kind === 'channel' ? people.filter((p) => p.staff || ms.docs.some((d) => String(d.member) === p.id && d.admin)) : people
    const n = await fill('g:' + r.id, PER_GROUP, writers.length ? writers : people)
    console.log(`${r.kind === 'channel' ? 'Channel' : 'Group'} “${r.name}”: ${n} messages by ${(writers.length ? writers : people).length} people`)
  }
  console.log('Done. Remove it all with: pnpm seed:chat-load --remove')
}
run().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
