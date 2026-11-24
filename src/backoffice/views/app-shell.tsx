'use client'
import Link from 'next/link'
import { BrandLogo } from '@/backoffice/components/brand-logo'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTheme } from '@/backoffice/components/theme-provider'
import {
  LayoutDashboard, Palette, Trophy, Languages, ShieldAlert, Settings2, MessagesSquare, UserCog, Database,
  ExternalLink, LogOut, Search, Moon, Sun, ChevronsUpDown, Monitor,
  KeyRound, CircleUserRound, Users2, BadgeCheck,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from '@/backoffice/components/ui/sidebar'
import { Separator } from '@/backoffice/components/ui/separator'
import { Button } from '@/backoffice/components/ui/button'
import { Avatar, AvatarFallback } from '@/backoffice/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/backoffice/components/ui/dropdown-menu'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/backoffice/components/ui/command'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/backoffice/components/ui/breadcrumb'

type ShellUser = { name: string; email: string; roles: string[] }
type NavItem = { title: string; href: string; icon: React.ComponentType<{ className?: string }>; external?: boolean; badge?: number }

const LABELS: Record<string, string> = { admin: 'Dashboard', partners: 'Partners', translations: 'Translations', moderation: 'Moderation', resets: 'Password resets', profile: 'Chat profile', matches: 'Matches', settings: 'Settings', site: 'Site', chat: 'Chat', team: 'Team accounts', account: 'My account', groups: 'Groups & channels', roles: 'Member roles' }

export function AppShell({ user, openReports, pendingResets = 0, partners, brand, children }: { user: ShellUser; openReports: number; pendingResets?: number; brand?: { logoUrl: string | null; siteName: string }; partners: { id: string; name: string }[]; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [cmd, setCmd] = useState(false)

  const groups: { label: string; items: NavItem[] }[] = [
    { label: 'Overview', items: [{ title: 'Dashboard', href: '/admin', icon: LayoutDashboard }] },
    {
      label: 'Content',
      items: [
        { title: 'Partners', href: '/admin/partners', icon: Palette },
        { title: 'Translations', href: '/admin/translations', icon: Languages },
        { title: 'Matches', href: '/admin/matches', icon: Trophy },
      ],
    },
    {
      label: 'Community',
      items: [
        { title: 'Moderation', href: '/admin/moderation', icon: ShieldAlert, badge: openReports },
        { title: 'Groups & channels', href: '/admin/groups', icon: Users2 },
        { title: 'Member roles', href: '/admin/roles', icon: BadgeCheck },
        { title: 'Password resets', href: '/admin/resets', icon: KeyRound, badge: pendingResets },
        { title: 'My chat profile', href: '/admin/profile', icon: CircleUserRound },
        { title: 'Chat settings', href: '/admin/settings/chat', icon: MessagesSquare },
      ],
    },
    {
      label: 'Settings',
      items: [
        { title: 'Site settings', href: '/admin/settings/site', icon: Settings2 },
        { title: 'Team accounts', href: '/admin/team', icon: UserCog },
        // raw Payload editor: owners only, as a last resort
        ...(user.roles.includes('owner') ? [{ title: 'Raw data editor', href: '/cms', icon: Database, external: true }] : []),
      ],
    },
  ]
  const all = groups.flatMap((g) => g.items)
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCmd((v) => !v) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function logout() {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' }).catch(() => null)
    router.replace('/admin/login')
    router.refresh()
  }

  const segs = pathname.split('/').filter(Boolean)
  const crumbs = segs.map((s, i) => ({ href: '/' + segs.slice(0, i + 1).join('/'), label: LABELS[s] || partners.find((p) => p.id === s)?.name || s }))
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/admin">
                  <BrandLogo url={brand?.logoUrl} />
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{brand?.siteName || 'OddsClub'}</span>
                    <span className="truncate text-xs text-muted-foreground">Back office</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((it) => (
                    <SidebarMenuItem key={it.href}>
                      <SidebarMenuButton asChild isActive={!it.external && isActive(it.href)} tooltip={it.title}>
                        {it.external ? (
                          <a href={it.href}><it.icon /><span>{it.title}</span></a>
                        ) : (
                          <Link href={it.href}><it.icon /><span>{it.title}</span></Link>
                        )}
                      </SidebarMenuButton>
                      {!!it.badge && <SidebarMenuBadge className="bg-destructive/15 text-destructive">{it.badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">{initials}</AvatarFallback></Avatar>
                    <span className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name || user.email}</span>
                      <span className="truncate text-xs capitalize text-muted-foreground">{user.roles.join(', ') || 'member'}</span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                  <DropdownMenuLabel className="font-normal"><div className="text-sm font-medium">{user.name || 'Account'}</div><div className="text-xs text-muted-foreground">{user.email}</div></DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><a href="/" target="_blank" rel="noopener"><ExternalLink />Open the site</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/admin/profile"><CircleUserRound />Chat profile</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/admin/account"><UserCog />My account</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={logout}><LogOut />Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((c, i) => (
                <span key={c.href} className="contents">
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {i === crumbs.length - 1 ? <BreadcrumbPage>{c.label}</BreadcrumbPage> : <BreadcrumbLink asChild><Link href={c.href}>{c.label}</Link></BreadcrumbLink>}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden w-56 justify-start text-muted-foreground sm:flex" onClick={() => setCmd(true)}>
              <Search />Search…<kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setCmd(true)} aria-label="Search"><Search /></Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>

      <CommandDialog open={cmd} onOpenChange={setCmd} title="Go to" description="Search pages and partners">
        <CommandInput placeholder="Type a page or partner…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {all.map((it) => (
              <CommandItem key={it.href} value={it.title} onSelect={() => { setCmd(false); if (it.external) window.location.href = it.href; else router.push(it.href) }}>
                <it.icon />{it.title}
              </CommandItem>
            ))}
          </CommandGroup>
          {partners.length > 0 && <CommandSeparator />}
          {partners.length > 0 && (
            <CommandGroup heading="Partners">
              {partners.map((p) => (
                <CommandItem key={p.id} value={'partner ' + p.name} onSelect={() => { setCmd(false); router.push('/admin/partners/' + p.id) }}>
                  <Palette />{p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  )
}

function ThemeToggle() {
  const { setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme('light')}><Sun />Light</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')}><Moon />Dark</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')}><Monitor />System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
