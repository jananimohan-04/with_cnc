async function check() {
  const res = await fetch('https://poioxmtrlqbiurrpgehd.supabase.co/rest/v1/', {
    headers: {
      'apikey': 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD'
    }
  });
  const data = await res.json();
  console.log(data.components ? Object.keys(data.components.schemas) : "No components");
  if (data.definitions) console.log("Definitions keys:", Object.keys(data.definitions));
  if (data.components?.schemas?.cnc_job_cards) {
    console.log(Object.keys(data.components.schemas.cnc_job_cards.properties));
  } else if (data.definitions?.cnc_job_cards) {
    console.log(Object.keys(data.definitions.cnc_job_cards.properties));
  }
}
check();
