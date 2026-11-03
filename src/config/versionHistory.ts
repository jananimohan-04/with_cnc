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
export const CURRENT_APP_VERSION = '1.0.3';

/**
 * Built-in version catalog. Whenever code is updated or released,
 * adding entries here ensures the UI displays the exact version-wise update.
 */
export const VERSION_HISTORY: VersionRelease[] = [
  {
    version: '1.0.3',
    releaseDate: 'November 3, 2026',
    title: 'DC Number Display in Delivery Challans & Auto-Update Polish',
    isLatest: true,
    isCurrent: true,
    highlights: [
      'Delivery Challans: Added dedicated DC No column with sorting and instant search filtering',
      'Desktop Auto-Updater: Verified signed auto-update distribution pipeline with GitHub Releases',
    ],
    sections: [
      {
        title: 'Sales & Dispatch',
        type: 'feature',
        items: [
          'Delivery Challans List: Added DC No column between DC Date and Company for quick visibility.',
          'Sorting & Filtering: Users can sort alphabetically/numerically by DC No and search by challan number.',
        ],
      },
      {
        title: 'Desktop Application',
        type: 'improvement',
        items: [
          'Background Auto-Update: Integrated GitHub Releases endpoint with cryptographic signature verification.',
        ],
      },
    ],
  },
  {
    version: '1.0.2',
    releaseDate: 'November 2, 2026',
    title: 'Actual Runs Flexibility, Costing Decoupling & Delivery Challan Linking',
    isLatest: false,
    isCurrent: false,
    highlights: [
      'Actual Runs: Save runs with or without finished quantity for flexible shop floor logging',
      'Finished Goods Costing: Decoupled physical goods movement to prevent duplicate key constraint conflicts',
      'Delivery Challan: Multi-tier fallback resolution for sales_order_id, eliminating not-null constraint errors',
      'Time Picker: Fixed hour/minute select box digit clipping in Add Runs modal',
      'Finished Goods: Automated card clearance upon full delivery fulfillment',
    ],
    sections: [
      {
        title: 'Production & Shop Floor',
        type: 'feature',
        items: [
          'Add Actual Runs: Operators can log machine operations without compulsory finished quantities for intermediate steps.',
          'Responsive modal layout: Widened machine process and operator columns to prevent text truncation.',
          'Start/End time selector display fixes: Removed inner borders to ensure full two-digit visibility.',
        ],
      },
      {
        title: 'Sales & Delivery Challans',
        type: 'fix',
        items: [
          'Sales Order Auto-Resolution: Delivery Challan creation now auto-locates or creates associated sales order records to satisfy the database foreign key constraint.',
          'Preserved delivery challan audit history while filtering cancelled challans from active kanban cards.',
          'Automatic card status sync when total delivered quantity meets or exceeds the ordered quantity.',
        ],
      },
      {
        title: 'Costing & Finished Goods',
        type: 'improvement',
        items: [
          'Costing Sheet Version Conflict Fix: Handled duplicate key constraint (cnc_costing_sheets_ver_key) gracefully by updating existing drafts or generating new version revisions.',
          'Physical goods movement decoupled from costing draft saves to prevent blocking warehouse inventory transfers.',
        ],
      },
    ],
  },
  {
    version: '1.0.1',
    releaseDate: 'October 28, 2026',
    title: 'Desktop Auto-Updater Channel & Multi-Company Document Profiles',
    isLatest: false,
    isCurrent: false,
    highlights: [
      'Tauri v2 signed auto-updater with cryptographic minisign verification',
      'Multi-company document profiles for Quotations, Invoices, and Delivery Challans',
      'Production tracking kanban view with live machine status integration',
      'In-app desktop installer download with SHA/size verification',
    ],
    sections: [
      {
        title: 'Desktop Application & Updates',
        type: 'feature',
        items: [
          'Background auto-updater service configured to check GitHub Releases automatically at startup and every 4 hours.',
          'Cryptographic verification ensuring no unverified binaries can be executed.',
          'Top navigation download affordance and profile menu integration.',
        ],
      },
      {
        title: 'Company Settings & Profiles',
        type: 'feature',
        items: [
          'Custom document profiles with company logos, GSTIN, bank details, and digital signatures.',
          'Separate profile configuration for Quotations, Tax Invoices, and Delivery Challans.',
        ],
      },
      {
        title: 'System Stability',
        type: 'fix',
        items: [
          'Loopback OAuth handler for Google authentication inside native Windows desktop shell.',
          'Enhanced file download shims directing all reports and exports directly into the Windows Downloads folder.',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    releaseDate: 'October 15, 2026',
    title: 'Business Intelligence & BI Suite Initial Production Release',
    isLatest: false,
    isCurrent: false,
    highlights: [
      'Comprehensive CNC manufacturing Business Intelligence spanning Sales, Engineering, Production, Inventory, and Finance',
      'Real-time machine scheduling and shop floor tracking',
      'CNC Vault with CAM file uploads and drawing preview',
      'Double-entry general ledger, trial balance, and profit & loss reports',
      'Native Windows NSIS desktop edition with local caching',
    ],
    sections: [
      {
        title: 'Core Business Intelligence Capabilities',
        type: 'feature',
        items: [
          'Sales Pipeline & Lead Management with multi-stage quotation workflow.',
          'Engineering BOM and Process Master for CNC routing and cycle time calculations.',
          'Shop Floor tracking with work orders, job cards, and operator logging.',
          'Warehouse inventory with raw materials, components, stock movements, and low-stock alerts.',
        ],
      },
      {
        title: 'Finance & Accounts',
        type: 'feature',
        items: [
          'Invoicing with automatic tax breakdowns (CGST/SGST/IGST).',
          'Bank entry matching and petty cash vouchers.',
          'Automated financial reports: Profit & Loss, Balance Sheet, and Trial Balance.',
        ],
      },
      {
        title: 'Desktop Edition',
        type: 'feature',
        items: [
          'Lightweight Windows installer powered by Tauri v2 and WebView2.',
          'Fast native window management with hardware acceleration.',
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
