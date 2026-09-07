import { useState } from 'react';
import { Plus, Eye, Edit, Trash2, Users as UsersIcon, ShieldCheck, Settings as SettingsIcon, FileText } from 'lucide-react';
import { PageHeader, FilterButton, ExportButton } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Badge, Button, StatCard, statusToVariant } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { users } from '@/data/mockData';
import type { User } from '@/data/mockData';

export function UsersPage() {
  const [showAdd, setShowAdd] = useState(false);

  const columns: Column<User>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (r) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{r.avatar}</div>
        <div><p className="font-medium text-slate-800">{r.name}</p><p className="text-xs text-slate-400">{r.email}</p></div>
      </div>
    )},
    { key: 'role', label: 'Role', sortable: true, render: (r) => <Badge variant={r.role === 'Administrator' ? 'brand' : 'neutral'}>{r.role}</Badge> },
    { key: 'department', label: 'Department', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.department}</span> },
    { key: 'phone', label: 'Phone', render: (r) => <span className="text-xs text-slate-500">{r.phone}</span> },
    { key: 'lastLogin', label: 'Last Login', sortable: true, render: (r) => <span className="text-xs text-slate-500">{r.lastLogin}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'Active' ? 'success' : 'error'} dot>{r.status}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: () => (
        <div className="flex items-center justify-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Edit size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="User Management" description="Manage system access and employee accounts" actions={<div className="flex items-center gap-2"><FilterButton /><ExportButton /></div>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users" value={users.length.toString()} icon={<UsersIcon size={20} />} accent="brand" />
        <StatCard label="Active" value={users.filter(u => u.status === 'Active').length.toString()} icon={<UsersIcon size={20} />} accent="success" />
        <StatCard label="Inactive" value={users.filter(u => u.status !== 'Active').length.toString()} icon={<UsersIcon size={20} />} accent="neutral" />
      </div>
      <DataTable data={users} columns={columns} searchKeys={['name', 'email', 'role', 'department']} onAdd={() => setShowAdd(true)} addLabel="Add User" />
    </div>
  );
}

function AdminStub({ title, description, icon: Icon }: { title: string, description: string, icon: any }) {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <Icon className="text-slate-400 mb-3" size={32} />
        <h3 className="text-slate-700 font-medium">{title}</h3>
        <p className="text-slate-500 text-sm mt-1">Configuration module coming soon.</p>
      </div>
    </div>
  );
}

export function RolesPage() { return <AdminStub title="Roles" description="Define user roles and group policies" icon={ShieldCheck} />; }
export function PermissionsPage() { return <AdminStub title="Permissions" description="Granular access control matrix" icon={ShieldCheck} />; }
export function SettingsPage() { return <AdminStub title="Company Settings" description="Global ERP configuration and preferences" icon={SettingsIcon} />; }
export function AuditLogsPage() { return <AdminStub title="Audit Logs" description="System-wide activity monitoring" icon={FileText} />; }
