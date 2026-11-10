// Version-wise release history and update manifest for Business Intelligence.
// Tracks application updates, feature rollouts, bug fixes, and changelogs.
// Dynamically synchronized with GitHub Releases when online.

export interface VersionChangeSection {
  title: string;
  type: 'feature' | 'fix' | 'improvement' | 'security';
  items: string[];
}

export interface VersionRelease {
  version: string;
  releaseDate: string;
  title: string;
  isLatest?: boolean;
  isCurrent?: boolean;
  highlights: string[];
  sections: VersionChangeSection[];
  installerUrl?: string;
  githubUrl?: string;
}

/** Current build version of the application. */
export const CURRENT_APP_VERSION = '1.0.6';

/**
 * Built-in version catalog. Whenever code is updated or released,
 * adding entries here ensures the UI displays the exact version-wise update.
 */
export const VERSION_HISTORY: VersionRelease[] = [
  {
    version: '1.0.6',
    releaseDate: 'November 10, 2026',
    title: 'Business Intelligence v1.0.6 — Store, Payments, Bank Import & Glass UI',
    isLatest: true,
    isCurrent: true,
    highlights: [
      'Quotation first: checkout generates, e-mails and WhatsApp-shares the quotation; the invoice and Razorpay payment link follow when the customer confirms',
      'Digital Store: per-company e-mail and Razorpay setup, invoice e-mail and pay-now redirect',
      'Bank statement import learns from your entries, marks unknown rows in red and follows the bank column order',
      'Glass look across the whole app, and BI / Retail Store on-off per company',
    ],
    sections: [
      {
        title: 'Store, Quotations & Payments',
        type: 'feature',
        items: [
          'Separate Quotation and Tax Invoice with their own discount, View popup, WhatsApp and e-mail sharing.',
          'Each company links its own e-mail account and Razorpay account (Digital Store > E-mail setup / Payment).',
          'Digital Store orders e-mail the invoice with a payment link and send the customer straight to pay.',
        ],
      },
      {
        title: 'Finance',
        type: 'improvement',
        items: [
          'Bank import reads NEFT / MB / UPI / IMPS / cheque narrations, learns from saved entries, and shows rows it cannot work out as UNKNOWN in red.',
          'Preview and saved bank tables follow the statement column order with full descriptions.',
        ],
      },
      {
        title: 'Platform',
        type: 'feature',
        items: [
          'Company Management: Business Intelligence and Retail Store can each be switched on or off per company.',
          'New glass design with animations across Business Intelligence and the Retail Store.',
        ],
      },
    ],
  },
  {
    version: '1.0.5',
    releaseDate: 'November 4, 2026',
    title: 'Business Intelligence v1.0.5 — Single-Page Invoices & Finished Goods Stock',
    highlights: [
      'Single-Page Sales Invoice: Compact 2-column GST footer fits invoice entirely on 1 page',
      'Finished Goods Stock Entry: Dedicated tracking for unordered products and buffer stock',
      'Excel Import & Export: Matched column template for seamless inventory operations',
    ],
    sections: [
      {
        title: 'Sales & Invoicing',
        type: 'improvement',
        items: [
          'Compact 2-Column Footer: Terms & Conditions on the left, Bank Details & Authorised Signatory on the right.',
          'Single-Page Guarantee: Ordinary invoices fit cleanly onto 1 single page with zero trailing signature overflow.',
          'Combined Invoice & DC: Multi-document preview now generates exactly 2 pages (Page 1 Invoice, Page 2 DC).',
        ],
      },
      {
        title: 'Inventory & Stock Management',
        type: 'feature',
        items: [
          'Add Finished Goods Stock: Quick modal to enter unordered manufactured items and opening stock.',
          'Custom Stock Columns: Product / Material Name, Category, Warehouse / Location, Unit, Available Qty (Opened Stock), Value (₹), Stock Status, Last Movement, Actions.',
          'Excel Support: Download Finished Goods CSV template and import directly with smart column synonyms.',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    releaseDate: 'November 3, 2026',
    title: 'Business Intelligence — Initial Client Release',
    isLatest: true,
    isCurrent: true,
    highlights: [
      'Business Intelligence Manufacturing Suite: Full operations management powered by ARGUS CNC',
      'Multi-Format Invoicing & Series Auto-Numbering: Configure custom invoice formats per company',
      'Cross-Platform: Windows Desktop Application & Android Mobile Application',
    ],
    sections: [
      {
        title: 'Sales & Invoicing',
        type: 'feature',
        items: [
          'Invoice Series Picker: Select, register, or create custom invoice number series per company with live format preview.',
          'Sequential Auto-Numbering: Automatically increments subsequent invoice numbers according to the active company format.',
          'Inline Edit & Persistence: Edit invoice numbers directly with immediate local and database registration.',
          'Branded Invoice Documents: Professional sales invoice generation with clean Document Type and Invoice No. presentation.',
        ],
      },
      {
        title: 'Production & Manufacturing',
        type: 'feature',
        items: [
          'Complete end-to-end pipeline from Enquiry to Sales Order, Job Cards, Actual Runs, Finished Goods, DC and Invoicing.',
          'Decoupled finished goods costing and inventory stock tracking.',
        ],
      },
      {
        title: 'Platform & Experience',
        type: 'improvement',
        items: [
          'Business Intelligence: Complete system branding with Powered by ARGUS CNC integration.',
          'Voice Assistant & Copilot: Intelligent voice navigation and workflow assistance.',
          'Auto-Updater: Built-in background updates with cryptographic signature verification.',
        ],
      },
    ],
  },
];

/**
 * Fetches releases dynamically from the GitHub Releases API.
 * If online and releases exist, returns merged release information.
 * If offline or empty, falls back seamlessly to the built-in VERSION_HISTORY.
 */
export async function fetchLiveVersionHistory(): Promise<VersionRelease[]> {
  try {
    const res = await fetch('https://api.github.com/repos/jananimohan-04/with_cnc/releases', {
      headers: { Accept: 'application/vnd.github.v3+json' },
      cache: 'no-cache',
    });

    if (!res.ok) return VERSION_HISTORY;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return VERSION_HISTORY;

    // Map GitHub releases to VersionRelease format
    const remoteReleases: VersionRelease[] = data.map((item: any, index: number) => {
      const tag = String(item.tag_name || '').replace(/^v/, '');
      const date = item.published_at
        ? new Date(item.published_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Recent';

      const bodyText: string = item.body || '';
      const lines = bodyText.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const highlights: string[] = [];
      const sections: VersionChangeSection[] = [];
      let currentSection: VersionChangeSection | null = null;

      for (const line of lines) {
        if (line.startsWith('###') || line.startsWith('##')) {
          const sectionTitle = line.replace(/^#+\s*/, '').trim();
          currentSection = {
            title: sectionTitle,
            type: sectionTitle.toLowerCase().includes('fix')
              ? 'fix'
              : sectionTitle.toLowerCase().includes('perf')
              ? 'improvement'
              : 'feature',
            items: [],
          };
          sections.push(currentSection);
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          const cleanItem = line.substring(2).trim();
          if (currentSection) {
            currentSection.items.push(cleanItem);
          } else {
            highlights.push(cleanItem);
          }
        }
      }

      // Find Windows setup installer asset if attached
      const exeAsset = item.assets?.find((a: any) => a.name?.endsWith('.exe'));

      return {
        version: tag || `1.0.${data.length - index}`,
        releaseDate: date,
        title: item.name || `Release v${tag}`,
        isLatest: index === 0,
        isCurrent: tag === CURRENT_APP_VERSION,
        highlights: highlights.length > 0 ? highlights : [item.name || `Version ${tag} update`],
        sections: sections.length > 0 ? sections : [
          {
            title: 'Release Notes',
            type: 'feature',
            items: highlights.length > 0 ? highlights : ['General enhancements and bug fixes.'],
          },
        ],
        installerUrl: exeAsset?.browser_download_url,
        githubUrl: item.html_url,
      };
    });

    // Merge: ensure built-in releases not present in GitHub still appear
    const knownVersions = new Set(remoteReleases.map((r) => r.version));
    const merged = [...remoteReleases];
    for (const local of VERSION_HISTORY) {
      if (!knownVersions.has(local.version)) {
        merged.push({
          ...local,
          isLatest: merged.length === 0,
        });
      }
    }

    return merged;
  } catch (err) {
    console.warn('[versionHistory] Could not fetch GitHub releases:', err);
    return VERSION_HISTORY;
  }
}
