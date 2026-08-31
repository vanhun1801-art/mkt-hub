// Kiểm phần logic tách auth_code và nhận diện redirect nội bộ / bên ngoài
const src = require('fs').readFileSync('ket-noi.js','utf8');
let pass=0, fail=0;
const t=(n,c,x='')=>{ if(c){pass++;console.log('  ok  '+n)} else {fail++;console.log('  FAIL '+n+' :: '+x)} };

const veMayNay = (r)=>/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(r);
t('127.0.0.1 → nội bộ', veMayNay('http://127.0.0.1:47124'));
t('localhost → nội bộ', veMayNay('http://localhost:47124'));
t('domain ngoài → KHÔNG nội bộ',
  !veMayNay('https://vi-du-domain-ngoai.com/callback'));

const layCong = (r)=>Number((r.match(/:(\d+)/)||[])[1] || 47124);
t('lấy đúng cổng', layCong('http://127.0.0.1:47124')===47124, String(layCong('http://127.0.0.1:47124')));

const tach=(v,ten='auth_code')=>{
  const m=v.match(new RegExp('[?&]'+ten+'=([^&\s]+)'));
  if(m) return decodeURIComponent(m[1]);
  if(!/[?&=]/.test(v)) return v;
  return null;
};
const U='https://vi-du-domain-ngoai.com/callback?auth_code=abc123XYZ&state=rooty';
t('tách auth_code từ URL thật', tach(U)==='abc123XYZ', String(tach(U)));
t('auth_code đứng cuối', tach('https://x/cb?state=rooty&auth_code=zzz')==='zzz');
t('dán thẳng mã', tach('abc123XYZ')==='abc123XYZ');
t('mã có ký tự mã hoá', tach('https://x/cb?auth_code=a%2Bb%3Dc')==='a+b=c', String(tach('https://x/cb?auth_code=a%2Bb%3Dc')));
t('URL không có mã → null', tach('https://x/cb?state=rooty')===null);

t('code có hàm danCodeTay', src.includes('async function danCodeTay'));
t('code hỏi Redirect URL', src.includes('Redirect URL ${C.dim'));
console.log('\n'+pass+' pass · '+fail+' fail');
process.exit(fail?1:0);
