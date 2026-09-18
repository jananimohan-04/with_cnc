import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRoles, createRole } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldOff, Check, X, Plus } from "lucide-react";
import { PERMISSIONS } from "@/lib/rbac";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/roles")({
  component: RolesPage,
});

function AddRoleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Role name is required");
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      await createRole({
        name,
        key,
        description,
        permissions: selectedPerms,
        is_system: false,
      });
    },
    onSuccess: () => {
      toast.success("Role created successfully");
      queryClient.invalidateQueries({ queryKey: ["roles-list"] });
      onOpenChange(false);
      setName("");
      setDescription("");
      setSelectedPerms([]);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Role</DialogTitle>
          <DialogDescription>
            Define a custom role and assign its system capabilities.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Role Name</Label>
            <Input
              id="name"
              placeholder="e.g. Project Manager"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this role's purpose"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2 mt-2">
            <Label>Permissions</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 max-h-[300px] overflow-y-auto p-1">
              {PERMISSIONS.map((perm) => (
                <div key={perm.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`perm-${perm.key}`}
                    checked={selectedPerms.includes(perm.key)}
                    onCheckedChange={() => togglePerm(perm.key)}
                  />
                  <Label
                    htmlFor={`perm-${perm.key}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {perm.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name}
          >
            {createMutation.isPending ? "Creating..." : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesPage() {
  const { can } = usePermissions();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: roles, isLoading } = useQuery({
    queryKey: ["roles-list"],
    queryFn: listRoles,
    enabled: can("manage_roles"),
  });

  if (!can("manage_roles")) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <ShieldOff className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2 max-w-md">
          You do not have permission to view or manage roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Roles & Permissions</h2>
          <p className="text-muted-foreground mt-1">
            Configure system roles and their capability matrix.
          </p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Role
        </Button>
      </div>

      <AddRoleDialog open={isAddOpen} onOpenChange={setIsAddOpen} />

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[200px] sticky left-0 bg-slate-50 z-10 shadow-[1px_0_0_0_#e2e8f0]">Permission</TableHead>
              {isLoading ? (
                <TableHead>Loading...</TableHead>
              ) : (
                roles?.map((role) => (
                  <TableHead key={role.id} className="text-center min-w-[120px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold text-slate-900">{role.name}</span>
                      {role.is_system && <Badge variant="secondary" className="text-[10px] px-1 h-4">System</Badge>}
                    </div>
                  </TableHead>
                ))
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSIONS.map((permission) => (
              <TableRow key={permission.key} className="hover:bg-slate-50">
                <TableCell className="font-medium text-slate-700 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#e2e8f0]">
                  {permission.label}
                </TableCell>
                {roles?.map((role) => {
                  const perms = (role.permissions as unknown as string[]) || [];
                  const hasPerm = role.name === "Super Admin" || perms.includes(permission.key);
                  
                  return (
                    <TableCell key={`${role.id}-${permission.key}`} className="text-center">
                      {hasPerm ? (
                        <Check className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-slate-300 mx-auto" />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
