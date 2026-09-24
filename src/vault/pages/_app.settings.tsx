import { createFileRoute, useNavigate } from "@/vault/router-adapter";
import { useAuth } from "@/vault/hooks/use-auth";
import { usePermissions } from "@/vault/hooks/use-permissions";
import { useEffect, useState } from "react";
import { supabase } from "@/vault/integrations/supabase/client";
import { Button } from "@/vault/components/ui/button";
import { Input } from "@/vault/components/ui/input";
import { Label } from "@/vault/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/vault/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vault/components/ui/tabs";
import { Switch } from "@/vault/components/ui/switch";
import { toast } from "sonner";
import { UserCircle, Shield, Settings2, Cloud, AlertCircle, RefreshCw, Check, Loader2, Building, Folder, FolderPlus, ChevronRight } from "lucide-react";
import { GoogleDriveService, DriveFolder } from "@/vault/services/google-drive";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/vault/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/vault/components/ui/select";
import { Badge } from "@/vault/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});


function CreateFolderModal({ partyId, partyName, folders, open, onOpenChange }: { partyId: string; partyName: string; folders: DriveFolder[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [folderName, setFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState<string>('root');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!folderName.trim()) throw new Error('Folder name is required');
      const parentId = parentFolderId === 'root' ? undefined : parentFolderId;
      await GoogleDriveService.createFolder(partyId, folderName.trim(), parentId);
    },
    onSuccess: () => {
      toast.success(`Folder "${folderName}" created in Google Drive!`);
      queryClient.invalidateQueries({ queryKey: ['drive_folders', partyId] });
      setFolderName('');
      setParentFolderId('root');
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create folder');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-600" />
            Create Google Drive Folder
          </DialogTitle>
          <DialogDescription>
            Create a folder inside {partyName}'s connected Google Drive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-2">
            <Label>Folder Name</Label>
            <Input 
              placeholder="e.g. CNC Programs, Drawings, Inspection Reports" 
              value={folderName} 
              onChange={(e) => setFolderName(e.target.value)} 
            />
          </div>

          <div className="space-y-2">
            <Label>Parent Folder (Location)</Label>
            <Select value={parentFolderId} onValueChange={setParentFolderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select parent location..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">📁 CNC Vault (Root)</SelectItem>
                {folders.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    📁 {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">Select "Root" for a top-level folder, or choose an existing folder to create a sub-folder.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-700" 
            onClick={() => createMutation.mutate()} 
            disabled={createMutation.isPending || !folderName.trim()}
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FolderPlus className="w-4 h-4 mr-2" />}
            Create Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartyDriveFolderSection({ party }: { party: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: folders, isLoading } = useQuery({
    queryKey: ['drive_folders', party.id],
    queryFn: () => GoogleDriveService.listFolders(party.id),
    enabled: !!party.drive_refresh_token || !!party.drive_email
  });

  if (!party.drive_refresh_token && !party.drive_email) return null;

  const folderList = folders || [];

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Folder className="w-3.5 h-3.5 text-indigo-500" /> Drive Folder Structure
        </span>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2" onClick={() => setIsModalOpen(true)}>
          <FolderPlus className="w-3.5 h-3.5 mr-1" /> New Folder
        </Button>
      </div>

      <CreateFolderModal 
        partyId={party.id} 
        partyName={party.name} 
        folders={folderList} 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
      />

      <div className="bg-white rounded-md border border-slate-200 p-2.5 space-y-1 text-sm overflow-hidden">
        <div className="flex items-center gap-2 text-slate-700 font-medium text-xs py-1.5 px-2 bg-slate-50/80 rounded border border-slate-100">
          <Folder className="w-4 h-4 text-amber-500 fill-amber-100" />
          <span>CNC Vault (Root)</span>
        </div>

        {isLoading ? (
          <div className="text-xs text-slate-400 p-2">Loading folders...</div>
        ) : folderList.length === 0 ? (
          <div className="text-xs text-slate-400 italic p-2">No custom sub-folders created yet. Click "New Folder" to create one.</div>
        ) : (
          <FolderTree folders={folderList} parentId={null} depth={1} />
        )}
      </div>
    </div>
  );
}

function FolderTree({ folders, parentId, depth }: { folders: any[], parentId: string | null, depth: number }) {
  const children = folders.filter(f => f.parent_folder_id === parentId);
  if (children.length === 0) return null;

  return (
    <div className="space-y-0.5 mt-0.5 relative">
      {/* Render a vertical connecting line for nested items */}
      {depth > 1 && (
        <div className="absolute left-[7px] top-0 bottom-3 w-px bg-slate-200" />
      )}
      
      {children.map((folder, index) => {
        const hasChildren = folders.some(f => f.parent_folder_id === folder.id);
        const isLast = index === children.length - 1;
        
        return (
          <div key={folder.id} className="relative">
            {/* Horizontal line connecting to the vertical line */}
            {depth > 1 && (
              <div className="absolute left-[7px] top-4 w-3 h-px bg-slate-200" />
            )}
            
            <div 
              className="flex items-center justify-between text-xs py-1.5 px-2 hover:bg-slate-50/80 rounded text-slate-600 transition-colors" 
              style={{ marginLeft: depth > 1 ? '16px' : '0px' }}
            >
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-indigo-400 fill-indigo-50" />
                <span className="font-medium text-slate-700">{folder.name}</span>
              </div>
            </div>
            
            {hasChildren && (
              <div className="relative">
                <FolderTree folders={folders} parentId={folder.id} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPage() {
  const { session, profile } = useAuth();
  const { can, isSuperAdmin, userPartyId } = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('connected=true')) {
      toast.success("Google Drive connected successfully!");
      // Clean up URL query parameter without page refresh
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Fetch Parties for Multi-Tenant Drive Connection
  const { data: parties, isLoading: partiesLoading, refetch: refetchParties } = useQuery({
    queryKey: ['settings_parties'],
    queryFn: async () => {
      const { data, error } = await supabase.from("cncvault_parties").select("id, name, drive_email, drive_folder_id, drive_refresh_token, drives:cncvault_party_drives(id, drive_email, drive_folder_id, created_at)").order("name");
      if (error) throw error;
      return data;
    },
    enabled: can("manage_settings")
  });

  const handleConnectDrive = async (partyId: string) => {
    try {
      toast.loading("Getting secure authorization link...");
      const { data, error } = await supabase.functions.invoke(`drive-api/auth-url?partyId=${partyId}`, {
        method: 'GET'
      });
      toast.dismiss();

      if (error) throw error;
      if (!data?.url) throw new Error("No URL returned from server");

      // Open OAuth in new tab
      window.open(data.url, '_blank');
      
      // Let the user know to refresh after connecting
      toast.success("Please authorize Google Drive in the new window, then refresh this page.", { duration: 8000 });
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Failed to initiate Drive connection. Is the Edge Function deployed?");
    }
  };

  const handleDisconnectDrive = async (driveId: string, partyId: string) => {
    try {
      if (!confirm("Are you sure you want to disconnect this drive?")) return;
      
      toast.loading("Disconnecting drive...");
      if (driveId === 'legacy') {
        const { error } = await supabase.from('cncvault_parties').update({ drive_refresh_token: null, drive_folder_id: null, drive_email: null }).eq('id', partyId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cncvault_party_drives').delete().eq('id', driveId);
        if (error) throw error;
      }
      
      toast.dismiss();
      toast.success("Drive disconnected successfully!");
      refetchParties();
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Failed to disconnect drive");
    }
  };

  if (!session) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h2>
        <p className="text-slate-500 mt-2">Manage your account settings and application preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-slate-100/80 p-1 w-full justify-start overflow-x-auto flex-nowrap rounded-xl border border-slate-200 shadow-sm h-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {can("manage_settings") && (
            <TabsTrigger value="app">Application Settings</TabsTrigger>
          )}
          {can("manage_settings") && (
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="w-5 h-5 text-indigo-500" />
                Personal Information
              </CardTitle>
              <CardDescription>Update your personal profile details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={profile?.full_name || ""} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input defaultValue={profile?.department || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input defaultValue={session?.user?.email || profile?.email || ""} disabled />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-slate-100 bg-slate-50 mt-4 rounded-b-xl px-6 py-4">
              <Button className="bg-indigo-600 hover:bg-indigo-700">Save Changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-500" />
                Security Settings
              </CardTitle>
              <CardDescription>Manage your password and security preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-sm">
                <Label>Current Password</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2 max-w-sm">
                <Label>New Password</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2 max-w-sm">
                <Label>Confirm New Password</Label>
                <Input type="password" />
              </div>
            </CardContent>
            <CardFooter className="border-t border-slate-100 bg-slate-50 mt-4 rounded-b-xl px-6 py-4">
              <Button>Update Password</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {can("manage_settings") && (
          <TabsContent value="app" className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-indigo-500" />
                  System Preferences
                </CardTitle>
                <CardDescription>Configure global application settings (Admins only).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-slate-900">Enforce Strict Versioning</h4>
                    <p className="text-sm text-slate-500">Prevent uploads that don't match the standard versioning schema.</p>
                  </div>
                  <Switch checked={true} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-slate-900">Require Approval Workflows</h4>
                    <p className="text-sm text-slate-500">Documents remain in 'Under Review' until explicitly approved.</p>
                  </div>
                  <Switch checked={true} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {can("manage_settings") && (
          <TabsContent value="integrations" className="space-y-6">
            <Card className="shadow-sm border-indigo-100">
              <CardHeader className="bg-indigo-50/50 rounded-t-xl border-b border-indigo-100">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-indigo-900">
                      <Cloud className="w-5 h-5 text-indigo-600" />
                      Google Drive Configuration
                    </CardTitle>
                    <CardDescription className="text-indigo-700/70">
                      Connect Google Drive for each company (Party) to isolate storage.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchParties()} disabled={partiesLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${partiesLoading ? 'animate-spin' : ''}`} />
                    Refresh Status
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Below are all the registered Companies in the system. Click "Connect Drive" to authorize a specific Google Account.
                  </p>
                  
                  {partiesLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                    </div>
                  ) : (
                    <div className="space-y-3 mt-4">
                      {parties?.filter(party => isSuperAdmin || party.id === userPartyId).map(party => {
                        const drives = party.drives && party.drives.length > 0 
                          ? party.drives 
                          : (party.drive_refresh_token ? [{ id: 'legacy', drive_email: party.drive_email }] : []);

                        return (
                        <div key={party.id} className="p-4 bg-slate-50 border rounded-lg hover:border-indigo-200 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="bg-white p-2 rounded border shadow-sm">
                                <Building className="w-5 h-5 text-indigo-500" />
                              </div>
                              <div>
                                <h4 className="font-semibold text-slate-800">{party.name}</h4>
                                  {drives.length > 0 ? (
                                    <div className="mt-1 space-y-1">
                                      {drives.map((d: any, idx: number) => (
                                        <div key={d.id} className="flex items-center gap-2">
                                          <p className="text-sm text-green-600 flex items-center gap-1 font-medium">
                                            <Check className="w-4 h-4" /> Drive {idx + 1}: {d.drive_email || 'Connected'}
                                          </p>
                                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDisconnectDrive(d.id, party.id)}>
                                            Disconnect
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                ) : (
                                  <p className="text-sm text-slate-500 mt-1">Not Connected</p>
                                )}
                              </div>
                            </div>
                            <Button 
                              variant={drives.length > 0 ? "outline" : "default"}
                              className={drives.length > 0 ? "text-slate-600" : "bg-indigo-600 hover:bg-indigo-700"}
                              onClick={() => handleConnectDrive(party.id)}
                            >
                              <Cloud className="w-4 h-4 mr-2" /> 
                              {drives.length > 0 ? "Add Another Drive" : "Connect Drive"}
                            </Button>
                          </div>
                          <PartyDriveFolderSection party={party} />
                        </div>
                      )})}
                      
                      {parties?.length === 0 && (
                        <div className="text-center p-6 text-slate-500 border border-dashed rounded-lg">
                          No companies found. Add a Party first.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <AlertCircle className="w-5 h-5 inline mr-2 -mt-0.5" />
                    <strong>Note:</strong> The Google Drive Edge Function must be deployed to your Supabase project before the Connect buttons will work. Run <code>npx supabase functions deploy drive-api</code> in your terminal.
                  </div>
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
