/* Thin wrapper so the existing router imports resolve; all logic lives in CompanyForm.
   New: /super/companies/new • Edit: /super/companies/:id/edit (edit detected via useParams). */
import CompanyForm from './CompanyForm';

export default function CompanyNew() {
  return <CompanyForm />;
}
