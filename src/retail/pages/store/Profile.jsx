/* Store profile — mirrors legacy vProfile: me-derived fields + Save toast + Logout. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  User, Mail, Phone, MapPin, Building2, ShieldCheck, 
  LogOut, Save, CheckCircle2, Sparkles, Compass, Check
} from 'lucide-react';
import { useAuth } from '../../auth';
import { toast, PageHero } from '../../components/ui';
import { getStoredMenuPosition, setStoredMenuPosition, MENU_POSITIONS } from '../../layout';

export default function Profile() {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('98765 00001');
  const [email, setEmail] = useState('');
  const [plant, setPlant] = useState('Chakan, Pune');

  const userId = me?.id || me?.email;
  const [menuPosition, setMenuPosition] = useState(() => getStoredMenuPosition(userId));

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (me) {
      setName(me.name || '');
      setEmail(me.email || '');
      setMenuPosition(getStoredMenuPosition(userId));
    }
  }, [me, userId]);

  if (!me) return null;

  const out = async () => {
    await logout();
    nav('/login', { replace: true });
  };

  const handleSave = (e) => {
    e.preventDefault();
    toast('Profile changes saved successfully', '✅');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6 w-full"
    >
      <PageHero
        title="Account & Profile"
        subtitle="Manage identity credentials, company associations, and delivery preferences."
        icon={User}
        badgeText="Verified Account"
        badgeColor="orange"
        gradient="from-orange-500 via-amber-500 to-red-500"
      />

      {/* Profile Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
          <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-black text-2xl shadow-md shadow-blue-500/20 flex-shrink-0">
            {(me.name || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black text-slate-900">{me.name}</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active Account
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                {String(me.role || '').replace('_', ' ')}
              </span>
              <span>•</span>
              <span className="font-mono text-blue-700 font-semibold">{me.companyId || 'PLATFORM'}</span>
              <span>•</span>
              <span>{me.email || ''}</span>
              {me.google && (
                <>
                  <span>•</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Google Auth
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Editable Form */}
        <form onSubmit={handleSave} className="space-y-5 pt-6 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" /> Full Name
              </label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Direct Mobile
              </label>
              <input 
                type="tel" 
                value={mobile} 
                onChange={(e) => setMobile(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Registered Email (Locked)
              </label>
              <input 
                type="email" 
                value={email} 
                disabled
                className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" /> Default Delivery Plant
              </label>
              <input 
                type="text" 
                value={plant} 
                onChange={(e) => setPlant(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 flex-wrap">
            <button 
              type="submit" 
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Save Preferences
            </button>

            <button 
              type="button" 
              onClick={out}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out of Platform
            </button>
          </div>
        </form>
      </div>

      {/* Menu Position Preferences Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Navigation Menu Position</h3>
              <p className="text-xs text-slate-500">Choose where the main ERP navigation appears on your screen</p>
            </div>
          </div>
          <span className="text-[11px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            Current: {menuPosition}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {MENU_POSITIONS.map((pos) => {
            const isSelected = menuPosition === pos.id;
            const IconComp = pos.icon;

            return (
              <div
                key={pos.id}
                onClick={() => {
                  setMenuPosition(pos.id);
                  setStoredMenuPosition(userId, pos.id);
                  toast(`Menu position updated to ${pos.label}`, '🧭');
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 select-none ${
                  isSelected
                    ? 'bg-amber-50/70 border-amber-500 shadow-xs ring-2 ring-amber-500/20'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IconComp className={`w-4 h-4 ${isSelected ? 'text-amber-700 font-bold' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-slate-900">{pos.label}</span>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-600 text-white flex items-center gap-1">
                      <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                    </span>
                  )}
                </div>

                {/* Mini illustration */}
                <div className="w-full h-12 rounded-lg border border-slate-200 bg-white p-1 flex relative overflow-hidden">
                  {pos.id === 'left' && (
                    <div className="flex w-full h-full gap-1">
                      <div className="w-3.5 h-full rounded-xs bg-amber-500 flex flex-col gap-0.5 p-0.5 items-center" />
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-slate-200 rounded" />
                        <div className="w-2/3 h-1 bg-slate-200 rounded" />
                      </div>
                    </div>
                  )}
                  {pos.id === 'right' && (
                    <div className="flex w-full h-full gap-1">
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-slate-200 rounded" />
                        <div className="w-2/3 h-1 bg-slate-200 rounded" />
                      </div>
                      <div className="w-3.5 h-full rounded-xs bg-amber-500 flex flex-col gap-0.5 p-0.5 items-center" />
                    </div>
                  )}
                  {pos.id === 'top' && (
                    <div className="flex flex-col w-full h-full gap-1">
                      <div className="w-full h-3 rounded-xs bg-amber-500" />
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-slate-200 rounded" />
                        <div className="w-3/4 h-1 bg-slate-200 rounded" />
                      </div>
                    </div>
                  )}
                  {pos.id === 'bottom' && (
                    <div className="flex flex-col w-full h-full gap-1">
                      <div className="flex-1 flex flex-col gap-0.5 p-0.5">
                        <div className="w-full h-1 bg-slate-200 rounded" />
                        <div className="w-3/4 h-1 bg-slate-200 rounded" />
                      </div>
                      <div className="w-full h-3 rounded-xs bg-amber-500" />
                    </div>
                  )}
                </div>

                <p className="text-[10.5px] leading-relaxed text-slate-500">
                  {pos.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
