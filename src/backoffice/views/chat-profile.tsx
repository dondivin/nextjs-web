'use client'
import { PhotoZoom } from '@/backoffice/components/photo-zoom'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ImageUp, Loader2, Shuffle, Trash2 } from 'lucide-react'
import { PageHeader } from '@/backoffice/components/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/backoffice/components/ui/card'
import { Button } from '@/backoffice/components/ui/button'
import { Input } from '@/backoffice/components/ui/input'
import { Label } from '@/backoffice/components/ui/label'
import { randomGradient } from '@/chat/gradient'
import { saveChatProfile } from '@/backoffice/actions/profile'

const ini = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?'

function Avatar({
  size,
  photo,
  gradient,
  name,
}: {
  size: number
  photo: string | null
  gradient: string
  name: string
}) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: gradient,
        fontSize: size * 0.36,
        textShadow: '0 1px 2px rgba(0,0,0,.25)',
      }}
    >
      {photo ? (
        <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        ini(name)
      )}
    </span>
  )
}

export function ChatProfileView({
  name: initialName,
  gradient: initialGradient,
  photo: initialPhoto,
  fallbackName,
}: {
  name: string
  gradient: string | null
  photo: string | null
  fallbackName: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState(initialName)
  const [gradient, setGradient] = useState(
    initialGradient || 'linear-gradient(135deg, #6E56CF, #3E63DD)',
  )
  const [photo, setPhoto] = useState<string | null>(initialPhoto)
  const [file, setFile] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(
    () => () => {
      if (file && photo) URL.revokeObjectURL(photo)
    },
    [file, photo],
  )
  const shown = name.trim() || fallbackName
  const dirty =
    name !== initialName ||
    gradient !== (initialGradient || 'linear-gradient(135deg, #6E56CF, #3E63DD)') ||
    !!file ||
    removePhoto

  function pickFile(f: File | undefined) {
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      toast.error('That photo is over 5 MB.')
      return
    }
    setFile(f)
    setPhoto(URL.createObjectURL(f))
    setRemovePhoto(false)
  }
  function clearPhoto() {
    setFile(null)
    setPhoto(null)
    setRemovePhoto(true)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('name', name)
    fd.set('gradient', gradient)
    if (file) fd.set('photo', file)
    if (removePhoto && !file) fd.set('removePhoto', '1')
    start(async () => {
      const r = await saveChatProfile(fd)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Chat profile saved. Open chats update right away.')
      setFile(null)
      setRemovePhoto(false)
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <PageHeader
        title="Chat profile"
        description="How you appear to members when you post in the site chat or answer their direct messages as the partner team."
      >
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}Save profile
        </Button>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader>
            <CardTitle>Name and avatar</CardTitle>
            <CardDescription>Members see this next to every message you send.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="chat-name">Name in the chat</Label>
              <Input
                id="chat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                placeholder={fallbackName}
                required
              />
              <p className="text-xs text-muted-foreground">
                2 to 24 letters or numbers. Members can’t pick a name the team uses.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Label>Avatar</Label>
              <div className="flex flex-wrap items-center gap-4">
                <PhotoZoom url={photo} label="Profile photo"><Avatar size={72} photo={photo} gradient={gradient} name={shown} /></PhotoZoom>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => input.current?.click()}
                  >
                    <ImageUp />
                    Upload a photo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (photo) clearPhoto()
                      setGradient(randomGradient())
                    }}
                  >
                    <Shuffle />
                    Shuffle colours
                  </Button>
                  {photo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={clearPhoto}
                    >
                      <Trash2 />
                      Remove photo
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or WebP up to 5 MB. Without a photo, the colours are used.
              </p>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif"
                hidden
                onChange={(e) => {
                  pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </CardContent>
        </Card>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>What members see</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  In a room
                </p>
                <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
                  <div className="flex items-end gap-2.5">
                    <Avatar size={34} photo={photo} gradient={gradient} name={shown} />
                    <div className="min-w-0 rounded-2xl rounded-bl-sm bg-background px-3 py-2 shadow-sm">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="truncate">{shown}</span>
                        <span className="rounded bg-brand/15 px-1 text-[10px] text-brand">Mod</span>
                      </div>
                      <p className="text-sm">Welcome to the lounge! Ask us anything about the bonus.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  In a member’s direct chat
                </p>
                <div className="overflow-hidden rounded-lg border">
                  <div className="flex items-center gap-2.5 border-b bg-muted/40 px-3 py-2.5">
                    <Avatar size={36} photo={photo} gradient={gradient} name={shown} />
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-sm font-semibold">{shown}</div>
                      <div className="text-xs text-muted-foreground">Partner team · online</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 bg-muted/20 p-3">
                    <div className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-sm text-brand-foreground">
                      My bonus hasn’t arrived yet
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-background px-3 py-2 text-sm shadow-sm">
                      Hi! How can I help with your bonus?
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
