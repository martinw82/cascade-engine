'use client';

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-xl p-6 space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 w-20" />
          <div className="skeleton h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5">
        <div className="skeleton h-5 w-32" />
      </div>
      <div className="p-6 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex space-x-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="skeleton h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-5 w-16" />
          </div>
          <div className="flex space-x-4">
            <div className="skeleton h-4 w-48" />
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
