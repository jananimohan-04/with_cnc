import fetch from 'node-fetch';

async function check() {
  const res = await fetch('https://poioxmtrlqbiurrpgehd.supabase.co/rest/v1/', {
    headers: {
      'apikey': 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD'
    }
  });
  const data = await res.json();
  const jc = data.definitions.cnc_job_cards.properties;
  console.log(Object.keys(jc));
}
check();
