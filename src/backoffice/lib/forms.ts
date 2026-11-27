import { z } from 'zod'

/** Form schemas shared by the back-office forms (client) and their server actions. */

const num = (min?: number, max?: number) => {
  let n = z.number({ error: 'Enter a number' })
  if (min !== undefined) n = n.min(min)
  if (max !== undefined) n = n.max(max)
  return n.nullable()
}

/* ---------- matches ---------- */
export const matchSchema = z
  .object({
    sport: z.enum(['football', 'basketball', 'tennis', 'esports', 'hockey', 'volleyball', 'other']),
    league: z.string().max(80),
    home: z.string().trim().min(1, 'Required').max(60),
    away: z.string().trim().min(1, 'Required').max(60),
    status: z.enum(['upcoming', 'live', 'ft']),
    startsAt: z.string().nullable(), // ISO date or null
    minute: num(0, 200),
    scoreHome: num(0, 999),
    scoreAway: num(0, 999),
    oddsHome: num(1, 1000),
    oddsDraw: num(1, 1000),
    oddsAway: num(1, 1000),
    order: z.number({ error: 'Enter a number' }).int(),
    active: z.boolean(),
  })
export type MatchForm = z.infer<typeof matchSchema>

/* ---------- per-language text ---------- */
export const localized = z.array(z.object({ locale: z.string(), value: z.string().max(2000) }))
export type Localized = z.infer<typeof localized>

/* ---------- site settings ---------- */
export const siteSchema = z.object({
  siteName: z.string().trim().min(1, 'Required').max(60),
  defaultPartner: z.string().nullable(),
  agentName: z.string().trim().max(40),
  helpline: localized,
  companyLine: localized,
  seoDescription: localized,
})
export type SiteForm = z.infer<typeof siteSchema>

/* ---------- chat settings ---------- */
export const chatSchema = z.object({
  slowModeSeconds: z.number({ error: 'Enter a number' }).int().min(0, '0 to 120').max(120, '0 to 120'),
  maxLength: z.number({ error: 'Enter a number' }).int().min(50, '50 to 2000').max(2000, '50 to 2000'),
  voiceMaxSeconds: z.number({ error: 'Enter a number' }).int().min(10, '10 to 600 seconds').max(600, '10 to 600 seconds'),
  mediaRetentionDays: z.number({ error: 'Enter a number' }).int().min(0, '0 to 3650 days').max(3650, '0 to 3650 days'),
  pmPictures: z.boolean(),   // private chats between members: pictures
  pmVoice: z.boolean(),      // … and voice messages
  pmForward: z.boolean(),    // … and forwarding their messages
  rules: z.array(z.object({ icon: z.string(), title: localized, body: localized })),
  bannedWords: z.string().max(20000), // one per line in the form
})
export type ChatForm = z.infer<typeof chatSchema>

/* ---------- community lounge (the chat's built-in main room) ---------- */
export const loungeSchema = z.object({
  chatTitle: localized,
  name: localized,
  subtitle: localized,
  description: localized,
  postBy: z.enum(['everyone', 'team']),
  mediaView: z.enum(['everyone', 'members', 'team', 'none']),
  mediaSave: z.boolean(),
})
export type LoungeForm = z.infer<typeof loungeSchema>

/* ---------- team ---------- */
export const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner', hint: 'Everything, including team accounts' },
  { value: 'editor', label: 'Editor', hint: 'Partners, matches, site settings' },
  { value: 'translator', label: 'Translator', hint: 'Languages and translations' },
  { value: 'moderator', label: 'Moderator', hint: 'Chat moderation, matches, talks to members as the partner team' },
] as const
export const roleEnum = z.enum(['owner', 'editor', 'translator', 'moderator'])
export const newMemberSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  roles: z.array(roleEnum).min(1, 'Pick at least one role'),
})
export type NewMemberForm = z.infer<typeof newMemberSchema>

/* ---------- own account ---------- */
export const accountSchema = z.object({
  name: z.string().trim().max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  newPassword: z.string().refine((v) => !v || v.length >= 8, 'At least 8 characters'),
  currentPassword: z.string(),
})
export type AccountForm = z.infer<typeof accountSchema>

/* ---------- groups & channels ---------- */
export const groupSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(60),
  description: z.string().max(300),
  rules: z.string().max(1000),
  kind: z.enum(['group', 'channel']),
  join: z.enum(['open', 'request', 'invite']),
  visibility: z.enum(['public', 'members', 'hidden']),
  preview: z.boolean(),
  autoAdd: z.boolean(),
  active: z.boolean(),
  order: z.number({ error: 'Enter a number' }).int(),
  mediaView: z.enum(['everyone', 'members', 'team', 'none']),
  mediaSave: z.boolean(),
  allowForward: z.boolean(),   // its messages can be forwarded to other chats
})
export type GroupForm = z.infer<typeof groupSchema>

/* ---------- member roles ---------- */
export const roleSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(30),
  description: z.string().max(140),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour'),
  isDefault: z.boolean(),
  order: z.number({ error: 'Enter a number' }).int(),
  createGroups: z.boolean(),
  createChannels: z.boolean(),
  maxRooms: z.number({ error: 'Enter a number' }).int().min(0).max(100),
  sendPictures: z.boolean(),
  privateChats: z.boolean(),
  showBadge: z.boolean(),
})
export type RoleForm = z.infer<typeof roleSchema>
