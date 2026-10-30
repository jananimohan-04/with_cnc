import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { DocumentProfilePage } from '@/pages/quotation/CompanyProfilePage';
import { PROFILE_KINDS, type ProfileKind } from '@/lib/companyProfile';

/** The "Profile" button of the Invoice and Delivery Challan pages (like the one on Quotations): opens that document's company profile. */
export function DocumentProfileButton({ kind, size = 'sm' }: { kind: ProfileKind; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const label = PROFILE_KINDS.find((k) => k.kind === kind)?.label ?? 'Profile';
  return (
    <>
      <Button variant="secondary" size={size} icon={<Building2 size={13} />} onClick={() => setOpen(true)} title={`${label}: the company details printed on every ${kind === 'dc' ? 'delivery challan' : 'invoice'}`}>
        Profile
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} subtitle="Logo, address, GSTIN, contacts and signature for this document" size="2xl">
        <DocumentProfilePage kind={kind} embedded />
      </Modal>
    </>
  );
}
