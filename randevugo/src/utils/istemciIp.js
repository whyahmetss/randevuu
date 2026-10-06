// Gerçek istemci IP'si. Render, Cloudflare üzerinden gelir: Cloudflare cf-connecting-ip
// başlığını kendisi yazar (istemci taklit edemez). Eskiden X-Forwarded-For'un İLK değeri
// alınıyordu — o değeri istemci istediği gibi yazabildiği için IP limitleri aşılabiliyordu;
// req.ip ise Render'ın iç adresi (10.x) olduğundan tüm kullanıcılar tek limit kovasındaydı.
function istemciIp(req) {
  const cf = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
  if (cf) return String(cf).trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

module.exports = { istemciIp };
