/* Tele CRM — cloud telephony provider layer.
 *
 * The routes (../routes.cjs) never talk to a provider directly; they use the adapter picked by TELEPHONY_PROVIDER.
 * To add a provider, create ./<name>.cjs exporting the same functions as ./twilio.cjs and add it to ADAPTERS.
 *
 * Adapter contract (all secrets come from environment variables and stay on the server):
 *   id, label
 *   missingConfig()                        -> string[]  names of required environment variables that are not set
 *   browserCalling                         -> true when calls can be made / answered in the browser
 *   clientToken(identity, ttlSeconds)      -> { token, expiresIn }  short-lived token for the browser phone
 *   verifyWebhook(fullUrl, params, headers)-> boolean   signature check of a provider webhook
 *   readVoice(params)                      -> { callId, from, to, fromAgent, customerNumber, custom }
 *   readStatus(params)                     -> { callId, parentCallId, status, duration, seq, toAgent }
 *   readDialResult(params)                 -> { callId, legId, dialStatus, duration }
 *   readRecording(params)                  -> { recordingId, callId, duration, status, channels }
 *   xmlOutbound(opts) / xmlInbound(opts) / xmlSay(text, hangup) / xmlAnnounce(text)  -> call instructions
 *   recordingAudio(recordingId)            -> fetch Response (audio/mpeg)  (streamed through our server only)
 *   deleteRecording(recordingId)
 *   redirectLeg(legId, xml)                -> move a live call leg to new instructions (transfer)
 *   hangupLeg(legId)
 *   findNumber(e164)                       -> { ref, e164 } | null      (number must exist in the provider account)
 *   pointNumber(ref, voiceUrl, statusUrl)  -> configures the number to send its calls to us
 *   identityFor(userId) / userFromIdentity(identity)
 */
'use strict';

const ADAPTERS = {
  twilio: () => require('./twilio.cjs'),
};

function providerName() {
  return String(process.env.TELEPHONY_PROVIDER || '').trim().toLowerCase();
}

/** The configured adapter, or null when no provider is selected / known. */
function getProvider() {
  const name = providerName();
  const make = ADAPTERS[name];
  return make ? make() : null;
}

/** What the admin screen shows: is calling switched on, and if not, what is missing. */
function providerStatus() {
  const name = providerName();
  if (!name) {
    return { configured: false, provider: '', supported: Object.keys(ADAPTERS), missing: ['TELEPHONY_PROVIDER'] };
  }
  const p = getProvider();
  if (!p) return { configured: false, provider: name, supported: Object.keys(ADAPTERS), missing: [`TELEPHONY_PROVIDER (unknown value "${name}")`] };
  const missing = p.missingConfig();
  return { configured: missing.length === 0, provider: p.id, label: p.label, browserCalling: !!p.browserCalling, supported: Object.keys(ADAPTERS), missing };
}

module.exports = { getProvider, providerStatus, ADAPTERS };
