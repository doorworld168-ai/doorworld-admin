import { Card, CardContent } from '@/components/ui/card';

export default function StatCard({ label, value, color, style }) {
  return (
    <Card className="stat-card" style={style}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1" style={color ? { color } : undefined}>{value ?? '—'}</div>
      </CardContent>
    </Card>
  );
}
