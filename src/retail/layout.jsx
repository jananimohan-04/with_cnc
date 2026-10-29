/* Global shell — modern responsive layout with Lucide icons & Framer Motion animations.
   Supports 4 customizable navigation positions: Left, Right, Top, Bottom with instant switching and persistence. */
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Building2, Boxes, FolderTree, Image as ImageIcon, 
  Receipt, FileText, Settings, ShieldCheck, Store, Home, ShoppingCart, 
  Package, User, Search, Menu, X, LogOut, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2,
  PenLine, IndianRupee, ClipboardCheck, Pin, HelpCircle,
  PanelLeft, PanelRight, PanelTop, PanelBottom, Compass, LayoutGrid, Check, CheckCircle2,
  MoreHorizontal, Sparkles
} from 'lucide-react';
import { useAuth } from './auth';
import { useCompany } from './companyContext';
import { getCart } from './api';
import { toast } from './components/ui';

import { MENU_CATALOG, ICON_MAP, getPageById } from './menuCatalog';

/* Menu Position Persistence */
const POSITION_STORAGE_KEY = 'cncforge_menu_position';

export function getStoredMenuPosition(userId) {
  try {
    const key = userId ? `${POSITION_STORAGE_KEY}_${userId}` : POSITION_STORAGE_KEY;
    const val = localStorage.getItem(key) || localStorage.getItem(POSITION_STORAGE_KEY);
    if (['left', 'right', 'top', 'bottom'].includes(val)) return val;
  } catch {}
  return 'left';
}

export function setStoredMenuPosition(userId, position) {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, position);
    if (userId) {
      localStorage.setItem(`${POSITION_STORAGE_KEY}_${userId}`, position);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cncforge_menu_position_changed', { detail: { position } }));
    }
  } catch {}
}

export const MENU_POSITIONS = [
  {
    id: 'left',
    label: 'Left',
    tagline: 'Standard Vertical Sidebar',
    description: 'Vertical sidebar attached to the left edge with collapsible drawer.',
    icon: PanelLeft
  },
  {
    id: 'right',
    label: 'Right',
    tagline: 'Right-Docked Sidebar',
    description: 'Vertical sidebar attached to the right edge with reverse flyout.',
    icon: PanelRight
  },
  {
    id: 'top',
    label: 'Top',
    tagline: 'Horizontal Header Menu',
    description: 'Navigation menu attached to the top edge with category dropdowns.',
    icon: PanelTop
  },
  {
    id: 'bottom',
    label: 'Bottom',
    tagline: 'Bottom Dock & Drawer',
    description: 'Compact bottom navigation bar with expandable category sheet.',
    icon: PanelBottom
  }
];

export function useNavCategories(counts) {
  const { me } = useAuth();
  const role = me && me.role;
  const companyTitle = ((me && me.companyId) || 'ARGUS').toUpperCase();
  const effective = me && me.effectivePermissions;

  const hasPermission = (pageId) => {
    const globalDisabled = me && me.globalDisabledMenus;
    if (Array.isArray(globalDisabled) && globalDisabled.includes(pageId)) {
      const superSafeguards = ['super_access', 'super_dashboard', 'super_settings', 'admin_settings', 'admin_invoice_profile', 'super_invoice_profile'];
      if (!(role === 'super_admin' && superSafeguards.includes(pageId))) {
        return false;
      }
    }
    if (Array.isArray(effective)) {
      return effective.includes(pageId);
    }
    const page = getPageById(pageId);
    if (!page) return false;
    const userRole = role || 'sales_user';
    return (page.defaultRoles || []).includes(userRole) || (userRole.startsWith('sales_') && (page.defaultRoles || []).includes('sales_user'));
  };

  const activeCategories = MENU_CATALOG.filter(cat => cat.id !== 'browse_categories').map(cat => ({
    ...cat,
    items: cat.items.filter(item => hasPermission(item.id))
  })).filter(cat => cat.items.length > 0);

  const isCatPermitted = (c) => {
    if (!c || !c.id) return false;
    const permId = `cat_${c.id.replace(/-/g, '_')}`;
    return hasPermission(permId);
  };

  const catalogCatModule = MENU_CATALOG.find(c => c.id === 'browse_categories');
  const fallbackCats = (catalogCatModule?.items || []).map(i => ({
    id: i.categorySlug,
    name: i.label,
    icon: i.emoji
  }));
  const allCats = (counts?.cats && counts.cats.length > 0) ? counts.cats : fallbackCats;
  const permittedCats = allCats.filter(isCatPermitted);
  const showCategories = permittedCats.length > 0;

  return { activeCategories, permittedCats, showCategories, role, companyTitle, hasPermission };
}

function sideLink(to, label, IconComponent, badge = null, onClick = null, mini = false, theme = null) {
  const activeClass = theme?.gradient
    ? `bg-gradient-to-r ${theme.gradient} text-white font-bold border-white/20 shadow-sm ${theme.glow || 'shadow-orange-500/25'}`
    : 'bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold border-orange-400/40 shadow-sm shadow-orange-500/25';
  const indicatorColor = theme?.indicator || 'bg-orange-500';
  const activeIconColor = 'text-white';
  const badgeClass = 'bg-white/25 text-white backdrop-blur-xs border border-white/20';

  return (
    <NavLink
      key={to}
      to={to}
      onClick={onClick}
      title={label}
      className={({ isActive }) => `
        group relative flex items-center ${mini ? 'justify-center p-2 w-9 h-9 mx-auto' : 'gap-2.5 px-2.5 py-1.5'} rounded-lg text-xs font-semibold transition-all duration-150
        ${isActive 
          ? `${activeClass} font-bold border` 
          : 'text-[#D7C4B7] hover:text-white hover:bg-[#22120A]/90'}
      `}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="activeIndicator"
              className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full shadow-xs ${indicatorColor}`}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <span className={`p-0.5 rounded-md transition-colors ${
            isActive 
              ? `${activeIconColor} bg-white/20 shadow-2xs` 
              : 'text-[#B89F8F] group-hover:text-amber-300 group-hover:bg-[#32170D]'
          }`}>
            {IconComponent && <IconComponent className="w-4 h-4 flex-shrink-0" />}
          </span>
          {!mini && (
            <span className={`truncate flex-1 tracking-tight font-semibold ${
              isActive ? '!text-white' : 'text-[#E8DDD5] group-hover:!text-white'
            }`}>
              {label}
            </span>
          )}
          {!mini && badge ? (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide ${isActive ? badgeClass : 'bg-[#170A04] text-[#D7C4B7] border border-[#36180C]'}`}>
              {badge}
            </span>
          ) : mini && badge ? (
            <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${indicatorColor} ring-2 ring-[#0E0704]`} />
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ counts, onItemClick, mini = false }) {
  const { activeCategories, permittedCats, showCategories, role, companyTitle, hasPermission } = useNavCategories(counts);

  return (
    <div className={`w-full flex flex-col ${mini ? 'gap-1 py-0.5 items-center' : 'gap-2 py-0.5'}`}>
      {activeCategories.map((cat, idx) => (
        <div key={cat.id} className="w-full">
          {idx > 0 && mini && <div className="w-8 border-t border-[#26140B] my-1 mx-auto" />}
          <div>
            {!mini && (
              <div className="flex items-center gap-1.5 px-3 mb-1 mt-1.5 first:mt-0">
                <span className={`w-1.5 h-1.5 rounded-full ${cat.dotClass || 'bg-amber-600'}`} />
                <span className="text-[10px] font-black uppercase tracking-wider text-[#A88E7D] truncate">
                  {role === 'company_admin' && cat.id === 'operations' ? `${companyTitle} • ${cat.label}` : cat.label}
                </span>
              </div>
            )}
            <div className={mini ? 'flex flex-col gap-0.5 items-center' : 'space-y-0.5'}>
              {cat.items.map(item => {
                const IconComp = ICON_MAP[item.icon] || Boxes;
                const badge = item.badgeKey ? (counts?.[item.badgeKey] || '') : null;
                return sideLink(item.path, item.label, IconComp, badge, onItemClick, mini, item.theme);
              })}
            </div>
          </div>
        </div>
      ))}

      {/* Guidance boxes for content writer / finance */}
      {!mini && role === 'content_writer' && hasPermission('content_writer') && !hasPermission('admin_products') && (
        <div className="mt-2 p-2.5 rounded-xl bg-[#180A04]/95 border border-[#36180C]/95">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-1">GUIDANCE</div>
          <p className="text-[11px] leading-relaxed text-[#D7C4B7]">
            Products arrive here automatically from ERP Inventory. Write sales copy, attach media, then
            <span className="font-bold text-white"> Submit to Finance</span> for pricing.
          </p>
        </div>
      )}

      {!mini && role === 'finance' && hasPermission('finance_review') && !hasPermission('admin_products') && (
        <div className="mt-2 p-2.5 rounded-xl bg-[#180A04]/95 border border-[#36180C]/95">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-teal-400 mb-1">GUIDANCE</div>
          <p className="text-[11px] leading-relaxed text-[#D7C4B7]">
            Review submitted content, set the selling price, then
            <span className="font-bold text-white"> Approve &amp; Publish</span> to make the listing visible.
          </p>
        </div>
      )}

      {/* Dynamic Browse Categories */}
      {showCategories && (
        <div className="w-full">
          {mini && <div className="w-8 border-t border-[#26140B] my-1 mx-auto" />}
          <div>
            {!mini && <div className="text-[10px] font-black uppercase tracking-wider text-[#A88E7D] px-3 mb-1 mt-1.5">BROWSE CATEGORIES</div>}
            <div className={mini ? 'flex flex-col gap-0.5 items-center' : 'space-y-0.5'}>
              {permittedCats.map((c) => (
                <NavLink
                  key={c.id}
                  to={'/store/listing?cat=' + c.id}
                  onClick={onItemClick}
                  title={c.name}
                  className={({ isActive }) => `
                    flex items-center ${mini ? 'justify-center w-9 h-9 p-1.5' : 'gap-2.5 px-2.5 py-1.5'} rounded-lg text-xs font-semibold transition-all
                    ${isActive ? 'bg-gradient-to-r from-[#3A1E0F] to-[#5C3018] text-white font-bold shadow-xs border border-[#7A3E1E]/50' : 'text-[#D7C4B7] hover:text-white hover:bg-[#22120A]/90'}
                  `}
                >
                  {({ isActive }) => (
                    <>
                      <span className="text-sm flex-shrink-0">{c.icon || '📦'}</span>
                      {!mini && (
                        <span className={`truncate flex-1 tracking-tight font-semibold ${
                          isActive ? '!text-white' : 'text-[#E8DDD5] group-hover:!text-white'
                        }`}>
                          {c.name}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Top Navigation Bar (Used when menuPosition === 'top')
   ========================================================================= */
export function TopNavigation({ counts, onItemClick, fullPage = false, onToggleFullPage }) {
  const { activeCategories, permittedCats, showCategories, role, companyTitle } = useNavCategories(counts);
  const [openCat, setOpenCat] = useState(null);
  const containerRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenCat(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Split into primary and overflow if more than 5 categories
  const maxVisible = 5;
  const visibleCats = activeCategories.slice(0, maxVisible);
  const overflowCats = activeCategories.slice(maxVisible);

  return (
    <div ref={containerRef} className="w-full bg-[#0E0704] border-b border-[#26140B] shadow-md z-40 text-stone-100 transition-all">
      <div className="w-full px-3 sm:px-5 flex items-center justify-between gap-2 h-11 overflow-x-visible">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto py-1 scrollbar-none">
          {visibleCats.map((cat) => {
            const isOpen = openCat === cat.id;
            return (
              <div key={cat.id} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenCat(isOpen ? null : cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isOpen
                      ? 'bg-[#3A1E0F] text-amber-300 border border-[#7A3E1E]/60 shadow-xs'
                      : 'text-[#D7C4B7] hover:text-white hover:bg-[#22120A] border border-transparent'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cat.dotClass || 'bg-amber-600'}`} />
                  <span className="truncate">
                    {role === 'company_admin' && cat.id === 'operations' ? `${companyTitle} • ${cat.label}` : cat.label}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-[#A89080] transition-transform duration-150 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-1 w-64 bg-[#0E0704] border border-[#36180C] rounded-xl shadow-2xl p-1.5 z-50 text-[#E8DDD5] space-y-0.5"
                    >
                      <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-500 border-b border-[#26140B] mb-1">
                        {cat.label} Modules
                      </div>
                      {cat.items.map((item) => {
                        const IconComp = ICON_MAP[item.icon] || Boxes;
                        const badge = item.badgeKey ? (counts?.[item.badgeKey] || '') : null;
                        return sideLink(item.path, item.label, IconComp, badge, () => { setOpenCat(null); if (onItemClick) onItemClick(); }, false, item.theme);
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Overflow Menu for Additional Categories */}
          {overflowCats.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setOpenCat(openCat === 'overflow' ? null : 'overflow')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  openCat === 'overflow'
                    ? 'bg-[#3A1E0F] text-amber-300 border border-[#7A3E1E]/60'
                    : 'text-[#D7C4B7] hover:text-white hover:bg-[#22120A] border border-transparent'
                }`}
              >
                <MoreHorizontal className="w-4 h-4 text-amber-500" />
                <span>More ({overflowCats.length})</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              <AnimatePresence>
                {openCat === 'overflow' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute left-0 top-full mt-1 w-72 bg-[#0E0704] border border-[#36180C] rounded-xl shadow-2xl p-2 z-50 text-[#E8DDD5] max-h-[75vh] overflow-y-auto sidebar-scroll"
                  >
                    {overflowCats.map((cat) => (
                      <div key={cat.id} className="mb-2 last:mb-0">
                        <div className="px-2 py-1 text-[10px] font-black uppercase text-amber-500 flex items-center gap-1.5 border-b border-[#26140B] mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${cat.dotClass || 'bg-amber-600'}`} />
                          {cat.label}
                        </div>
                        <div className="space-y-0.5">
                          {cat.items.map((item) => {
                            const IconComp = ICON_MAP[item.icon] || Boxes;
                            const badge = item.badgeKey ? (counts?.[item.badgeKey] || '') : null;
                            return sideLink(item.path, item.label, IconComp, badge, () => { setOpenCat(null); if (onItemClick) onItemClick(); }, false, item.theme);
                          })}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Browse Categories Dropdown */}
          {showCategories && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setOpenCat(openCat === 'categories' ? null : 'categories')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  openCat === 'categories'
                    ? 'bg-[#3A1E0F] text-amber-300 border border-[#7A3E1E]/60'
                    : 'text-[#D7C4B7] hover:text-white hover:bg-[#22120A] border border-transparent'
                }`}
              >
                <span>📦</span>
                <span>Categories</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#A89080]" />
              </button>

              <AnimatePresence>
                {openCat === 'categories' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute left-0 top-full mt-1 w-64 bg-[#0E0704] border border-[#36180C] rounded-xl shadow-2xl p-1.5 z-50 text-[#E8DDD5] max-h-[60vh] overflow-y-auto sidebar-scroll"
                  >
                    <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-500 border-b border-[#26140B] mb-1">
                      Browse Categories
                    </div>
                    {permittedCats.map((c) => (
                      <NavLink
                        key={c.id}
                        to={'/store/listing?cat=' + c.id}
                        onClick={() => { setOpenCat(null); if (onItemClick) onItemClick(); }}
                        className={({ isActive }) => `
                          flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${isActive ? 'bg-[#3A1E0F] text-white font-bold' : 'text-[#D7C4B7] hover:text-white hover:bg-[#22120A]'}
                        `}
                      >
                        <span>{c.icon || '📦'}</span>
                        <span className="truncate">{c.name}</span>
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Full Page View Button */}
        {onToggleFullPage && (
          <button
            type="button"
            onClick={onToggleFullPage}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#A89080] hover:text-white hover:bg-[#22120A] border border-[#2C160B] transition-colors cursor-pointer"
            title="Toggle full page focus mode"
          >
            <Maximize2 className="w-3 h-3 text-amber-500" />
            <span className="hidden sm:inline">Full Page</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   Bottom Navigation Dock & Expandable Sheet (Used when menuPosition === 'bottom')
   ========================================================================= */
export function BottomNavigation({ counts, onItemClick, fullPage = false, onToggleFullPage }) {
  const { activeCategories, permittedCats, showCategories } = useNavCategories(counts);
  const [activePopup, setActivePopup] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dockRef = useRef(null);

  // Close popup on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dockRef.current && !dockRef.current.contains(e.target)) {
        setActivePopup(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      {/* Upward Category Popover */}
      <AnimatePresence>
        {activePopup && (
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={() => setActivePopup(null)}>
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed bottom-16 left-4 right-4 sm:left-auto sm:right-auto sm:w-80 bg-[#0E0704] border border-[#36180C] rounded-2xl shadow-2xl p-3 z-50 text-[#E8DDD5] max-h-[65vh] overflow-y-auto sidebar-scroll"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            >
              {(() => {
                const cat = activeCategories.find(c => c.id === activePopup);
                if (!cat) return null;
                return (
                  <div>
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#26140B]">
                      <span className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cat.dotClass || 'bg-amber-600'}`} />
                        {cat.label}
                      </span>
                      <button onClick={() => setActivePopup(null)} className="p-1 rounded-md text-[#A89080] hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {cat.items.map((item) => {
                        const IconComp = ICON_MAP[item.icon] || Boxes;
                        const badge = item.badgeKey ? (counts?.[item.badgeKey] || '') : null;
                        return sideLink(item.path, item.label, IconComp, badge, () => { setActivePopup(null); if (onItemClick) onItemClick(); }, false, item.theme);
                      })}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Menu Bottom Sheet Drawer */}
      <AnimatePresence>
        {sheetOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-full max-h-[80vh] bg-[#0E0704] border-t border-[#36180C] rounded-t-3xl shadow-2xl p-4 sm:p-6 z-10 flex flex-col overflow-hidden text-[#E8DDD5]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#26140B] mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 font-bold">
                    <LayoutGrid className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">ARGUSCNC Navigation Hub</h3>
                    <p className="text-[10px] text-[#A89080]">Access all ERP modules &amp; product categories</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="p-1.5 rounded-xl bg-[#1A0A04] hover:bg-[#26140B] text-[#A89080] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto sidebar-scroll pr-1">
                <Sidebar counts={counts} onItemClick={() => setSheetOpen(false)} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fixed Bottom Dock Bar */}
      <div 
        ref={dockRef}
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#0E0704]/98 backdrop-blur-md border-t border-[#26140B] shadow-2xl px-2 sm:px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center justify-between gap-1 sm:gap-2 text-stone-100"
      >
        <div className="flex items-center gap-1 sm:gap-1.5 flex-1 min-w-0 overflow-x-auto scrollbar-none py-0.5">
          {activeCategories.slice(0, 4).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActivePopup(activePopup === cat.id ? null : cat.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 cursor-pointer ${
                activePopup === cat.id
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-[#150A05] text-[#D7C4B7] hover:text-white hover:bg-[#22120A] border border-[#2C160B]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cat.dotClass || 'bg-amber-600'}`} />
              <span className="truncate max-w-[100px]">{cat.label}</span>
              <ChevronUp className="w-3 h-3 text-[#A89080]" />
            </button>
          ))}
        </div>

        {/* Central "All Modules / Menu" Button */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl text-xs font-black shadow-md shadow-orange-600/30 flex-shrink-0 cursor-pointer transition-transform active:scale-95"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>All Modules</span>
        </button>

        {onToggleFullPage && (
          <button
            type="button"
            onClick={onToggleFullPage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-[#A89080] hover:text-white bg-[#150A05] border border-[#2C160B] flex-shrink-0 cursor-pointer"
            title="Toggle Full Page"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-500" />
          </button>
        )}
      </div>
    </>
  );
}

/* =========================================================================
   Visual Menu Position Selector Modal
   ========================================================================= */
export function MenuPositionModal({ isOpen, onClose, currentPosition, onSelectPosition }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg bg-[#0E0704] border border-[#36180C] rounded-2xl shadow-2xl p-5 sm:p-6 text-stone-100 z-10 space-y-5"
      >
        <div className="flex items-start justify-between pb-3 border-b border-[#26140B]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Menu Position</h2>
              <p className="text-xs text-[#A89080]">Choose where the main ERP navigation appears on your screen</p>
            </div>
          </div>
          <button
            type="button"
            id="closePositionModalBtn"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#A89080] hover:text-white hover:bg-[#22120A] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Visual Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MENU_POSITIONS.map((pos) => {
            const isSelected = currentPosition === pos.id;
            const IconComp = pos.icon;

            return (
              <div
                key={pos.id}
                id={`menuPosOption_${pos.id}`}
                onClick={() => {
                  onSelectPosition(pos.id);
                  toast(`Menu position updated to ${pos.label}`, '🧭');
                }}
                className={`relative p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 group select-none ${
                  isSelected
                    ? 'bg-gradient-to-br from-[#2E1508] to-[#1F0C05] border-amber-500 shadow-md shadow-amber-500/15 ring-1 ring-amber-500/40'
                    : 'bg-[#150A05] hover:bg-[#1C0D06] border-[#2C160B] hover:border-[#4A2510]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <IconComp className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-[#A89080] group-hover:text-amber-300'}`} />
                    <span className="text-sm font-black text-white">{pos.label}</span>
                  </div>

                  {isSelected ? (
                    <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                      <Check className="w-3 h-3 stroke-[3]" /> Active
                    </span>
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-[#3A1E0F] group-hover:border-amber-500/50" />
                  )}
                </div>

                {/* Visual Layout Miniature Preview Illustration */}
                <div className="w-full h-16 rounded-lg border border-[#3A1E0F] bg-[#0E0704] p-1 flex relative overflow-hidden">
                  {pos.id === 'left' && (
                    <div className="flex w-full h-full gap-1">
                      <div className="w-5 h-full rounded-xs bg-amber-500 flex flex-col gap-0.5 p-0.5 items-center shadow-xs">
                        <div className="w-2.5 h-0.5 bg-black/50 rounded" />
                        <div className="w-3 h-0.5 bg-black/50 rounded" />
                        <div className="w-2.5 h-0.5 bg-black/50 rounded" />
                      </div>
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-[#2C160B] rounded" />
                        <div className="w-2/3 h-1 bg-[#2C160B] rounded" />
                        <div className="w-full h-4 bg-[#1F0C05] rounded mt-auto border border-[#3A1E0F]/40" />
                      </div>
                    </div>
                  )}

                  {pos.id === 'right' && (
                    <div className="flex w-full h-full gap-1">
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-[#2C160B] rounded" />
                        <div className="w-2/3 h-1 bg-[#2C160B] rounded" />
                        <div className="w-full h-4 bg-[#1F0C05] rounded mt-auto border border-[#3A1E0F]/40" />
                      </div>
                      <div className="w-5 h-full rounded-xs bg-amber-500 flex flex-col gap-0.5 p-0.5 items-center shadow-xs">
                        <div className="w-2.5 h-0.5 bg-black/50 rounded" />
                        <div className="w-3 h-0.5 bg-black/50 rounded" />
                        <div className="w-2.5 h-0.5 bg-black/50 rounded" />
                      </div>
                    </div>
                  )}

                  {pos.id === 'top' && (
                    <div className="flex flex-col w-full h-full gap-1">
                      <div className="w-full h-4 rounded-xs bg-amber-500 flex items-center justify-between px-1 shadow-xs">
                        <div className="w-2 h-1 bg-black/50 rounded" />
                        <div className="flex gap-0.5">
                          <div className="w-3 h-0.5 bg-black/50 rounded" />
                          <div className="w-3 h-0.5 bg-black/50 rounded" />
                          <div className="w-3 h-0.5 bg-black/50 rounded" />
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-[#2C160B] rounded" />
                        <div className="w-3/4 h-1 bg-[#2C160B] rounded" />
                        <div className="w-full h-3 bg-[#1F0C05] rounded mt-auto border border-[#3A1E0F]/40" />
                      </div>
                    </div>
                  )}

                  {pos.id === 'bottom' && (
                    <div className="flex flex-col w-full h-full gap-1">
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-[#2C160B] rounded" />
                        <div className="w-3/4 h-1 bg-[#2C160B] rounded" />
                      </div>
                      <div className="w-full h-4 rounded-xs bg-amber-500 flex items-center justify-around px-1 shadow-xs">
                        <div className="w-2 h-1 bg-black/50 rounded-xs" />
                        <div className="w-2 h-1 bg-black/50 rounded-xs" />
                        <div className="w-2 h-1 bg-black/50 rounded-xs" />
                        <div className="w-2 h-1 bg-black/50 rounded-xs" />
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-[11px] leading-relaxed text-[#A89080]">
                  {pos.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#26140B] text-xs text-[#A89080]">
          <span>Preferences are automatically saved.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all cursor-pointer shadow-sm shadow-amber-600/30"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* =========================================================================
   Help & Support Modal
   ========================================================================= */
export function HelpSupportModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-[#0E0704] border border-[#36180C] rounded-2xl shadow-2xl p-6 text-stone-100 z-10 space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#26140B]">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-sky-400" />
            <h3 className="font-black text-white text-base">Help &amp; Documentation</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[#A89080] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-[#D7C4B7]">
          <div className="p-3 bg-[#150A05] rounded-xl border border-[#2C160B] space-y-1">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>⌨️</span> Keyboard Shortcuts
            </div>
            <div className="text-[11px] text-[#A89080]">
              Press <kbd className="px-1.5 py-0.5 bg-[#26140B] text-amber-300 font-mono rounded text-[10px] border border-[#36180C]">/</kbd> anywhere to focus global SKU &amp; part number search.
            </div>
          </div>

          <div className="p-3 bg-[#150A05] rounded-xl border border-[#2C160B] space-y-1">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>🧭</span> Navigation Customization
            </div>
            <div className="text-[11px] text-[#A89080]">
              Switch navigation layout between Left, Right, Top, or Bottom from your Profile Menu at any time.
            </div>
          </div>

          <div className="p-3 bg-[#150A05] rounded-xl border border-[#2C160B] space-y-1">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>🏭</span> Industrial Support Desk
            </div>
            <div className="text-[11px] text-[#A89080]">
              Email: <span className="text-white font-mono font-bold">technologiesargus@gmail.com</span><br />
              Hotline: <span className="text-white font-mono font-bold">+91 98765 43210</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 bg-[#22120A] hover:bg-[#32170D] text-amber-400 font-bold text-xs rounded-xl border border-[#36180C] transition-colors"
        >
          Close
        </button>
      </motion.div>
    </div>
  );
}

/* =========================================================================
   Topbar with Profile Dropdown & Quick Position Toggle
   ========================================================================= */
export const Topbar = forwardRef(function Topbar(
  { onMobileToggle, sidebarOpen, onToggleSidebar, noSide, menuPosition = 'left', onOpenPositionModal }, 
  ref
) {
  const { me, loginAs, logout } = useAuth();
  const { activeCompany, setActiveCompany, companies } = useCompany();
  const [q, setQ] = useState('');
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const dropdownRef = useRef(null);
  const nav = useNavigate();
  const cartN = (getCart() || []).reduce((a, c) => a + (c.qty || 0), 0);

  const submit = (e) => {
    e.preventDefault();
    nav('/store/listing' + (q ? '?q=' + encodeURIComponent(q) : ''));
  };

  // Close profile dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('headerSearchInput')?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const ROLE_LABELS = {
    super_admin: 'Super Admin',
    company_admin: 'Company Admin',
    content_writer: 'Content Writer',
    finance: 'Finance',
    sales_regional_partner: 'Regional Partner (+10%)',
    sales_channel_partner: 'Channel Partner (+15%)',
    sales_referral_partner: 'Referral Partner (+5%)',
    sales_user: 'Sales'
  };
  const roleLabel = me?.salesTier ? `${me.salesTier} (+${me.markupPct || 0}%)` : (ROLE_LABELS[me?.role] || 'Sales');

  return (
    <>
      <header ref={ref} className="sticky top-0 z-50 bg-[#0E0704] backdrop-blur-md border-b border-[#26140B] shadow-md shadow-black/40 w-full text-stone-100">
        <div className="w-full px-3 sm:px-5 h-15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onMobileToggle}
              className="lg:hidden p-2 rounded-xl text-[#A89080] hover:text-white hover:bg-[#22120A] transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <Link to="/store/home" className="flex items-center gap-2 group flex-shrink-0 bg-white keep-white px-3 py-1.5 rounded-xl shadow-xs border border-white/20 transition-transform hover:scale-105 duration-200">
              <img src="/assets/argus-logo.png" alt="ARGUSCNC" className="h-7 sm:h-8 w-auto object-contain" />
            </Link>

            <Link
              to="/sales/pipeline"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 hover:text-white bg-[#1A0C06] hover:bg-[#2A1408] border border-[#4A2510] transition-colors shadow-xs"
              title="Return to ERP Pipeline & Manufacturing modules"
            >
              <span className="text-amber-400 font-extrabold text-sm leading-none">←</span>
              <span>Back to ERP</span>
            </Link>

            {/* Quick Full Page View Toggle for Left/Right sidebar layouts */}
            {!noSide && (menuPosition === 'left' || menuPosition === 'right') && (
              <button
                type="button"
                onClick={onToggleSidebar}
                title={sidebarOpen ? "Collapse sidebar to Full Page view" : "Expand sidebar with full labels"}
                className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold cursor-pointer shadow-xs ml-3 sm:ml-4 ${
                  !sidebarOpen
                    ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white border-orange-500 hover:from-orange-600 hover:to-amber-700 shadow-sm shadow-orange-500/30'
                    : 'bg-[#180A04]/90 border-[#36180C]/80 text-[#D7C4B7] hover:bg-[#22120A] hover:text-white'
                }`}
              >
                {!sidebarOpen ? (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                    <span className="hidden xl:inline">Full Page View</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose className="w-3.5 h-3.5 text-[#A89080]" />
                    <span className="hidden xl:inline">Full Page</span>
                  </>
                )}
              </button>
            )}
          </div>

          <form onSubmit={submit} className="flex-1 max-w-xl hidden md:flex items-center relative">
            <Search className="w-4 h-4 text-[#A89080] absolute left-3.5 pointer-events-none" />
            <input
              id="headerSearchInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search SKU, part number, brand, industrial tooling..."
              className="w-full pl-9 pr-10 py-1.5 text-xs bg-[#150A05] border border-[#2C160B] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 transition-all text-stone-100 placeholder-[#9E8676]"
            />
            <kbd className="absolute right-3 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#A89080] bg-[#241007] border border-[#36180C] rounded-md pointer-events-none shadow-xs">/</kbd>
          </form>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            {/* Global Company Selector for Super Admin */}
            {me?.role === 'super_admin' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#150A05] border border-[#2C160B] hover:border-amber-600/50 rounded-xl shadow-xs transition-colors">
                <Building2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <select
                  value={activeCompany}
                  onChange={(e) => setActiveCompany(e.target.value)}
                  className="company-select bg-[#150A05] text-xs font-bold text-stone-100 outline-none cursor-pointer border-none py-0.5 pr-1 max-w-[150px] sm:max-w-[185px] truncate"
                  title="Filter active company scope across Super Admin pages"
                >
                  <option value="all" className="bg-[#0E0704] text-stone-100">🏢 All Companies (Platform)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0E0704] text-stone-100">
                      {c.logo || '🏭'} {c.name} ({c.code || c.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Role switchers for development/testing */}
            {(!me || !me.google) && (
              <div className="hidden 2xl:flex items-center gap-1 p-0.5 bg-[#150A05] rounded-xl border border-[#2C160B] text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => loginAs('super_admin')}
                  className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${me?.role === 'super_admin' ? 'bg-[#6B3519] text-white shadow-xs font-black' : 'text-[#A89080] hover:text-white'}`}
                >
                  Super
                </button>
                <button
                  type="button"
                  onClick={() => loginAs('company_admin')}
                  className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${me?.role === 'company_admin' ? 'bg-[#542812] text-white shadow-xs font-black' : 'text-[#A89080] hover:text-white'}`}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => loginAs('content_writer')}
                  className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${me?.role === 'content_writer' ? 'bg-fuchsia-600 text-white shadow-xs' : 'text-[#A89080] hover:text-white'}`}
                >
                  Content
                </button>
                <button
                  type="button"
                  onClick={() => loginAs('finance')}
                  className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${me?.role === 'finance' ? 'bg-teal-600 text-white shadow-xs' : 'text-[#A89080] hover:text-white'}`}
                >
                  Finance
                </button>
                <button
                  type="button"
                  onClick={() => loginAs('sales_user')}
                  className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${me?.role === 'sales_user' ? 'bg-amber-600 text-white shadow-xs' : 'text-[#A89080] hover:text-white'}`}
                >
                  Sales
                </button>
              </div>
            )}

            {/* Shopping Cart Button */}
            <Link
              to="/store/cart"
              className="relative p-2 rounded-xl border border-[#2C160B] bg-[#150A05] hover:bg-[#22120A] text-[#D7C4B7] hover:text-amber-400 transition-all duration-200 shadow-xs group cursor-pointer"
              aria-label="Shopping Cart"
            >
              <ShoppingCart className="w-4 h-4 transition-transform group-hover:scale-110" />
              {cartN > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 bg-orange-600 text-white font-extrabold text-[10px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 shadow-sm border border-[#0E0704]"
                >
                  {cartN}
                </motion.span>
              )}
            </Link>

            {/* User Profile Dropdown Anchor Container */}
            <div ref={dropdownRef} className="relative">
              {/* Trigger Button (Combined user chip + icon) */}
              <button
                type="button"
                id="profileDropdownTriggerBtn"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 bg-[#150A05] hover:bg-[#22120A] px-2.5 py-1.5 rounded-xl border border-[#2C160B] transition-all cursor-pointer group shadow-xs"
                title={me?.name ? `${me.name} (${roleLabel}) — Profile & Settings` : 'User Profile'}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <span className="hidden sm:inline text-xs font-bold text-[#E8DDD5] truncate max-w-[120px]">{me?.name || 'User'}</span>
                <span className="hidden sm:inline text-[10px] uppercase font-extrabold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded-md tracking-wider">
                  {roleLabel}
                </span>
                <User className="w-4 h-4 text-[#A89080] group-hover:text-amber-400 transition-transform group-hover:scale-110" />
                <ChevronDown className={`w-3 h-3 text-[#A89080] transition-transform duration-150 ${profileDropdownOpen ? 'rotate-180 text-amber-400' : ''}`} />
              </button>

              {/* Profile Dropdown Menu */}
              <AnimatePresence>
                {profileDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-[#0E0704] border border-[#2C160B] shadow-2xl shadow-black/80 p-2 z-50 text-stone-100 backdrop-blur-md"
                  >
                    {/* User Identity Header */}
                    <div className="p-3 bg-[#150A05] rounded-xl border border-[#26140B] mb-2 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 text-white flex items-center justify-center font-black text-base shadow-sm flex-shrink-0">
                        {(me?.name || 'U')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">{me?.name}</div>
                        <div className="text-[10px] text-[#A89080] truncate">{me?.email}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">
                            {roleLabel}
                          </span>
                          <span className="text-[9px] font-mono text-[#8C7A6B]">
                            {me?.companyId || 'PLATFORM'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Dropdown Options */}
                    <div className="space-y-0.5">
                      {/* 1. My Profile & Account */}
                      <Link
                        to="/store/profile"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#D7C4B7] hover:text-white hover:bg-[#22120A] transition-colors"
                      >
                        <User className="w-4 h-4 text-amber-500" />
                        <span>My Profile &amp; Account</span>
                      </Link>

                      {/* 2. Company Invoice & Quotation Profile (Super Admin & Company Admin) */}
                      {(me?.role === 'super_admin' || me?.role === 'company_admin') && (
                        <Link
                          to="/admin/settings?tab=invoice"
                          id="profileDropdownInvoiceProfileBtn"
                          onClick={() => setProfileDropdownOpen(false)}
                          className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#D7C4B7] hover:text-white hover:bg-[#22120A] transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5">
                            <Receipt className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                            <span className="font-bold text-white">Invoice &amp; QR Profile</span>
                          </div>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Rule 46
                          </span>
                        </Link>
                      )}

                      {/* 3. Menu Position — immediately before full page view */}
                      <button
                        type="button"
                        id="profileDropdownMenuPositionBtn"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          if (onOpenPositionModal) onOpenPositionModal();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#D7C4B7] hover:text-white hover:bg-[#22120A] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5">
                          <Compass className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform" />
                          <span className="font-bold text-white">Menu Position</span>
                        </div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          {menuPosition}
                        </span>
                      </button>

                      {/* 3. Full Page View */}
                      <button
                        type="button"
                        onClick={() => {
                          onToggleSidebar();
                          setProfileDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#D7C4B7] hover:text-white hover:bg-[#22120A] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <Maximize2 className="w-4 h-4 text-orange-400" />
                          <span>Full Page View</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${!sidebarOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#180A04] text-[#A89080]'}`}>
                          {!sidebarOpen ? 'Active' : 'Off'}
                        </span>
                      </button>

                      {/* 4. Help & Support */}
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setHelpOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#D7C4B7] hover:text-white hover:bg-[#22120A] transition-colors cursor-pointer"
                      >
                        <HelpCircle className="w-4 h-4 text-sky-400" />
                        <span>Help &amp; Support</span>
                      </button>

                      <div className="my-1.5 border-t border-[#26140B]" />

                      {/* 5. Sign Out */}
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                          nav('/login');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-white hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-400" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Direct Logout Icon Button */}
            <button
              type="button"
              onClick={() => { logout(); nav('/login'); }}
              className="p-2 rounded-xl text-[#B89F8F] hover:text-rose-400 hover:bg-rose-950/40 border border-[#2C160B] transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Help Modal */}
      <HelpSupportModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
});

/* =========================================================================
   Shell Layout Component with Left / Right / Top / Bottom Positioning
   ========================================================================= */
export function Shell({ counts, noSide, children }) {
  const { me } = useAuth();
  const userId = me?.id || me?.email;

  // Menu Position state (persisted per user in localStorage)
  const [menuPosition, setMenuPosition] = useState(() => getStoredMenuPosition(userId));
  const [positionModalOpen, setPositionModalOpen] = useState(false);

  // Sync menu position when user changes or event fires
  useEffect(() => {
    const sync = () => setMenuPosition(getStoredMenuPosition(userId));
    sync();
    window.addEventListener('cncforge_menu_position_changed', sync);
    return () => window.removeEventListener('cncforge_menu_position_changed', sync);
  }, [userId]);

  const handleSelectPosition = (newPos) => {
    setMenuPosition(newPos);
    setStoredMenuPosition(userId, newPos);
  };

  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('cncforge_sidebar_open');
      return saved === 'true'; // Default is false (Full Page mode)
    } catch { return false; }
  });

  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const location = useLocation();
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(56);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem('cncforge_sidebar_open', String(next)); } catch {}
      return next;
    });
  };

  const handleTriggerEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(true);
  };

  const handleTriggerLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 280);
  };

  const handleSidebarEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const handleSidebarLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 280);
  };

  useEffect(() => {
    setMobileOpen(false);
    setIsHovered(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!headerRef.current) return;
    const update = () => {
      if (headerRef.current) setHeaderH(headerRef.current.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#DAC8B8] text-[#1A0A03] font-sans w-full relative">
      {/* Topbar */}
      <Topbar 
        ref={headerRef}
        onMobileToggle={() => setMobileOpen(true)} 
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        noSide={noSide}
        menuPosition={menuPosition}
        onOpenPositionModal={() => setPositionModalOpen(true)}
      />

      {/* TOP POSITION NAVIGATION */}
      {!noSide && menuPosition === 'top' && (
        <TopNavigation 
          counts={counts}
          fullPage={!sidebarOpen}
          onToggleFullPage={toggleSidebar}
        />
      )}

      {/* LEFT POSITION FLYOUT TRIGGER & DRAWER (in Full Page mode) */}
      {!noSide && menuPosition === 'left' && !sidebarOpen && (
        <>
          {/* Left Edge Hover Detection Strip */}
          <div
            onMouseEnter={handleTriggerEnter}
            onMouseOver={handleTriggerEnter}
            onMouseLeave={handleTriggerLeave}
            className="fixed left-0 top-15 bottom-0 w-3.5 z-40 hidden lg:block cursor-pointer pointer-events-auto"
            title="Move cursor here to reveal menu"
          />

          {/* Left Edge Arrow Pull-Tab Button */}
          <div
            id="leftEdgeArrowBtn"
            onMouseEnter={handleTriggerEnter}
            onMouseOver={handleTriggerEnter}
            onMouseLeave={handleTriggerLeave}
            onClick={() => setIsHovered(prev => !prev)}
            className="fixed left-0 top-1/2 -translate-y-1/2 z-40 hidden lg:flex items-center cursor-pointer group select-none transition-all duration-200 -translate-x-3 hover:translate-x-0 opacity-80 hover:opacity-100"
            title="Hover or click to reveal navigation menu"
          >
            <div className="flex items-center gap-1.5 pl-1.5 pr-2 py-2.5 bg-[#0E0704]/95 hover:bg-[#1A0A04] text-amber-400 hover:text-white border-y border-r border-[#36180C] hover:border-amber-500/80 rounded-r-2xl shadow-xl shadow-black/60 backdrop-blur-md transition-all duration-200 group-hover:shadow-amber-500/25">
              <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-black transition-colors shadow-2xs">
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#D7C4B7] group-hover:text-white pr-0.5 transition-colors hidden group-hover:inline">
                Menu
              </span>
            </div>
          </div>

          {/* Left Flyout Backdrop & Drawer */}
          <div
            onClick={() => setIsHovered(false)}
            className={`fixed inset-0 bg-black/35 backdrop-blur-[1px] z-40 hidden lg:block transition-opacity duration-200 ${
              isHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          />

          <aside
            style={{ top: `${headerH}px`, height: `calc(100vh - ${headerH}px)` }}
            onMouseEnter={handleSidebarEnter}
            onMouseOver={handleSidebarEnter}
            onMouseLeave={handleSidebarLeave}
            className={`fixed left-0 z-50 w-72 bg-[#0E0704] border-r border-[#26140B] shadow-2xl p-2.5 hidden lg:flex flex-col overflow-y-auto sidebar-scroll sidebar-dark text-[#E8DDD5] transition-transform duration-200 ease-out ${
              isHovered ? 'translate-x-0 shadow-2xl shadow-black/80' : '-translate-x-full pointer-events-none'
            }`}
          >
            <div className="flex items-center justify-between pb-2 mb-1.5 px-2 border-b border-[#26140B] flex-shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                <PanelLeftOpen className="w-3.5 h-3.5" />
                <span>Navigation Menu</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    toggleSidebar();
                    setIsHovered(false);
                  }}
                  className="px-2 py-1 rounded-lg text-[#D7C4B7] hover:text-white hover:bg-[#22120A] text-[10px] font-bold flex items-center gap-1 border border-[#36180C] cursor-pointer"
                  title="Keep sidebar pinned open permanently"
                >
                  <Pin className="w-3 h-3 text-amber-500" />
                  <span>Pin Open</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsHovered(false)}
                  className="p-1 rounded-lg text-[#A89080] hover:text-white hover:bg-[#22120A] cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto sidebar-scroll">
              <Sidebar counts={counts} onItemClick={() => setIsHovered(false)} />
            </div>
          </aside>
        </>
      )}

      {/* RIGHT POSITION FLYOUT TRIGGER & DRAWER (in Full Page mode) */}
      {!noSide && menuPosition === 'right' && !sidebarOpen && (
        <>
          {/* Right Edge Hover Detection Strip */}
          <div
            onMouseEnter={handleTriggerEnter}
            onMouseOver={handleTriggerEnter}
            onMouseLeave={handleTriggerLeave}
            className="fixed right-0 top-15 bottom-0 w-3.5 z-40 hidden lg:block cursor-pointer pointer-events-auto"
            title="Move cursor here to reveal menu"
          />

          {/* Right Edge Arrow Pull-Tab Button */}
          <div
            id="rightEdgeArrowBtn"
            onMouseEnter={handleTriggerEnter}
            onMouseOver={handleTriggerEnter}
            onMouseLeave={handleTriggerLeave}
            onClick={() => setIsHovered(prev => !prev)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 hidden lg:flex items-center cursor-pointer group select-none transition-all duration-200 translate-x-3 hover:translate-x-0 opacity-80 hover:opacity-100"
            title="Hover or click to reveal navigation menu"
          >
            <div className="flex items-center gap-1.5 pr-1.5 pl-2 py-2.5 bg-[#0E0704]/95 hover:bg-[#1A0A04] text-amber-400 hover:text-white border-y border-l border-[#36180C] hover:border-amber-500/80 rounded-l-2xl shadow-xl shadow-black/60 backdrop-blur-md transition-all duration-200 group-hover:shadow-amber-500/25">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#D7C4B7] group-hover:text-white pl-0.5 transition-colors hidden group-hover:inline">
                Menu
              </span>
              <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-black transition-colors shadow-2xs">
                <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>

          {/* Right Flyout Backdrop & Drawer */}
          <div
            onClick={() => setIsHovered(false)}
            className={`fixed inset-0 bg-black/35 backdrop-blur-[1px] z-40 hidden lg:block transition-opacity duration-200 ${
              isHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          />

          <aside
            style={{ top: `${headerH}px`, height: `calc(100vh - ${headerH}px)` }}
            onMouseEnter={handleSidebarEnter}
            onMouseOver={handleSidebarEnter}
            onMouseLeave={handleSidebarLeave}
            className={`fixed right-0 z-50 w-72 bg-[#0E0704] border-l border-[#26140B] shadow-2xl p-2.5 hidden lg:flex flex-col overflow-y-auto sidebar-scroll sidebar-dark text-[#E8DDD5] transition-transform duration-200 ease-out ${
              isHovered ? 'translate-x-0 shadow-2xl shadow-black/80' : 'translate-x-full pointer-events-none'
            }`}
          >
            <div className="flex items-center justify-between pb-2 mb-1.5 px-2 border-b border-[#26140B] flex-shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                <PanelRight className="w-3.5 h-3.5" />
                <span>Navigation Menu</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    toggleSidebar();
                    setIsHovered(false);
                  }}
                  className="px-2 py-1 rounded-lg text-[#D7C4B7] hover:text-white hover:bg-[#22120A] text-[10px] font-bold flex items-center gap-1 border border-[#36180C] cursor-pointer"
                  title="Keep sidebar pinned open permanently"
                >
                  <Pin className="w-3 h-3 text-amber-500" />
                  <span>Pin Open</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsHovered(false)}
                  className="p-1 rounded-lg text-[#A89080] hover:text-white hover:bg-[#22120A] cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto sidebar-scroll">
              <Sidebar counts={counts} onItemClick={() => setIsHovered(false)} />
            </div>
          </aside>
        </>
      )}

      {/* MAIN LAYOUT BODY */}
      <div className="flex-1 flex w-full min-h-0 items-stretch">
        {/* LEFT POSITION PINNED SIDEBAR */}
        {!noSide && menuPosition === 'left' && sidebarOpen && (
          <aside 
            style={{ top: `${headerH}px`, height: `calc(100vh - ${headerH}px)` }}
            className="hidden lg:flex flex-col flex-shrink-0 bg-[#0E0704] border-r border-[#26140B] sticky self-start overflow-y-auto sidebar-scroll sidebar-dark text-[#E8DDD5] transition-all duration-200 z-30 shadow-md w-64 px-2 py-2.5"
          >
            <div className="flex items-center justify-between pb-2 mb-1 px-2 border-b border-[#26140B]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#A89080]">Navigation</span>
              <button
                type="button"
                onClick={toggleSidebar}
                className="px-2 py-0.5 rounded-lg text-[#A89080] hover:text-white hover:bg-[#22120A] text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                title="Switch to Full Page view (hover arrow to reveal)"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Full Page</span>
              </button>
            </div>
            <Sidebar counts={counts} />
          </aside>
        )}

        {/* MAIN PAGE CONTENT CONTAINER */}
        <div className={`flex-1 min-w-0 flex flex-col justify-between w-full transition-colors duration-200 bg-[#DAC8B8] ${
          menuPosition === 'bottom' ? 'pb-24 sm:pb-28' : ''
        }`}>
          <main className="w-full flex-1 px-3 py-2 sm:px-4 sm:py-2.5 lg:px-4 lg:py-2.5">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8, scale: 0.998 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              {children}
            </motion.div>
          </main>

          <footer className="border-t border-[#26140B] bg-[#0E0704] py-4 text-xs text-[#A89080] w-full mt-auto">
            <div className="w-full px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div>
                <span className="font-bold text-white">ARGUSCNC ERP Industrial Procurement</span> • Connected B2B Factory Platform
              </div>
              <div className="flex items-center gap-4 text-[#A89080] font-medium">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>Multi-Tenant Architecture</span>
                <span>•</span>
                <span>Encrypted Cloud Storage</span>
              </div>
            </div>
          </footer>
        </div>

        {/* RIGHT POSITION PINNED SIDEBAR */}
        {!noSide && menuPosition === 'right' && sidebarOpen && (
          <aside 
            style={{ top: `${headerH}px`, height: `calc(100vh - ${headerH}px)` }}
            className="hidden lg:flex flex-col flex-shrink-0 bg-[#0E0704] border-l border-[#26140B] sticky self-start overflow-y-auto sidebar-scroll sidebar-dark text-[#E8DDD5] transition-all duration-200 z-30 shadow-md w-64 px-2 py-2.5 order-last"
          >
            <div className="flex items-center justify-between pb-2 mb-1 px-2 border-b border-[#26140B]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#A89080]">Navigation</span>
              <button
                type="button"
                onClick={toggleSidebar}
                className="px-2 py-0.5 rounded-lg text-[#A89080] hover:text-white hover:bg-[#22120A] text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                title="Switch to Full Page view (hover arrow to reveal)"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Full Page</span>
              </button>
            </div>
            <Sidebar counts={counts} />
          </aside>
        )}
      </div>

      {/* BOTTOM POSITION DOCK NAVIGATION */}
      {!noSide && menuPosition === 'bottom' && (
        <BottomNavigation 
          counts={counts}
          fullPage={!sidebarOpen}
          onToggleFullPage={toggleSidebar}
        />
      )}

      {/* Universal Mobile Sliding Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/75"
            />
            <motion.div
              initial={{ x: menuPosition === 'right' ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: menuPosition === 'right' ? '100%' : '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className={`fixed inset-y-0 ${menuPosition === 'right' ? 'right-0 border-l' : 'left-0 border-r'} w-72 bg-[#0E0704] border-[#26140B] shadow-2xl p-4 flex flex-col z-10 overflow-y-auto sidebar-scroll sidebar-dark text-[#E8DDD5]`}
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#26140B] mb-2">
                <div className="bg-white keep-white px-2 py-1 rounded-lg">
                  <img src="/assets/argus-logo.png" alt="ARGUSCNC" className="h-6 w-auto" />
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-[#A89080] hover:text-white hover:bg-[#22120A]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Sidebar counts={counts} onItemClick={() => setMobileOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Menu Position Selector Modal */}
      <MenuPositionModal
        isOpen={positionModalOpen}
        onClose={() => setPositionModalOpen(false)}
        currentPosition={menuPosition}
        onSelectPosition={handleSelectPosition}
      />
    </div>
  );
}
