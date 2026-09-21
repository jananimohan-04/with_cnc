async function check() {
  const res = await fetch('https://poioxmtrlqbiurrpgehd.supabase.co/rest/v1/', {
    headers: {
      'apikey': 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD'
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data).slice(0, 500));
}
check();
