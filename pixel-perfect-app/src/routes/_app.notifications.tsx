import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Check, Info, AlertTriangle, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "NEW_VERSION":
      case "NEW_DOCUMENT": return <Info className="w-5 h-5 text-blue-500" />;
      case "APPROVAL_REQUIRED": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "ACCESS_CHANGED": return <ShieldAlert className="w-5 h-5 text-purple-500" />;
      default: return <Bell className="w-5 h-5 text-slate-500" />;
    }
  };

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h2>
          <p className="text-muted-foreground mt-1">
            Stay updated on document changes, approvals, and access updates.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="outline" 
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <Check className="w-4 h-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Loading notifications...</div>
      ) : !notifications || notifications.length === 0 ? (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-lg font-medium text-slate-900">All caught up!</p>
            <p className="text-slate-500">You don't have any notifications right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <div 
              key={notification.id} 
              className={`flex gap-4 p-4 rounded-lg border transition-colors ${notification.read ? 'bg-white border-slate-200' : 'bg-indigo-50/50 border-indigo-100 shadow-sm'}`}
            >
              <div className="shrink-0 mt-1">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between items-start">
                  <h4 className={`text-sm font-semibold ${notification.read ? 'text-slate-700' : 'text-slate-900'}`}>
                    {notification.title}
                  </h4>
                  <span className="text-xs text-slate-500 whitespace-nowrap ml-4">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className={`text-sm ${notification.read ? 'text-slate-500' : 'text-slate-700'}`}>
                  {notification.message}
                </p>
                
                {/* Actions if needed based on type */}
                {!notification.read && (
                  <div className="pt-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 -ml-2"
                      onClick={() => markReadMutation.mutate(notification.id)}
                    >
                      Mark as read
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
