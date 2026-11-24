'use client'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/backoffice/components/ui/chart'

const config = { messages: { label: 'Messages', color: 'var(--brand)' } } satisfies ChartConfig

export function ActivityChart({ data }: { data: { day: string; messages: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <Bar dataKey="messages" fill="var(--color-messages)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
