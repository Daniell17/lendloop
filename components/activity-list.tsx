"use client";

import { reminderActivityLabel } from "@/convex/lib/activity";

type Activity = {
  kind: string;
  summary: string;
  createdAt: number;
};

export function ActivityList({ activity }: { activity: Activity[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-muted">No automation yet.</p>;
  }

  return (
    <ul className="space-y-1 text-sm text-muted">
      {activity.map((event) => (
        <li key={`${event.kind}-${event.createdAt}-${event.summary}`}>
          {event.kind === "reminder_sent"
            ? reminderActivityLabel(event.createdAt, Date.now())
            : event.summary}
        </li>
      ))}
    </ul>
  );
}
