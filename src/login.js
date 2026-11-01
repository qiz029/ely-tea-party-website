// /login/: each button starts WorkOS sign-in, coming back to ?next; a failed attempt comes back with ?error.
import { api, english, prefix } from '/market.js';

const errors = english ? {
  denied: 'Sign-in was cancelled.', expired: 'That sign-in took too long or came from another tab. Try again.',
  unverified: 'Verify your email address with the provider first, then try again.',
  email_taken: 'This email already belongs to another account. Sign in the way you did before.',
  auth_failed: 'The sign-in service had a problem. Try again in a moment.', no_auth: 'Sign-in isn’t open yet.',
  rate_limited: 'Too many sign-ins from this network. Try again in a few minutes.',
} : {
  denied: '你取消了登录。', expired: '登录超时，或者是从别的标签页发起的，请重新登录。',
  unverified: '请先在登录服务那边验证你的邮箱，再重新登录。',
  email_taken: '这个邮箱已经属于另一个账号，请用你之前的方式登录。',
  auth_failed: '登录服务暂时出错了，请稍后再试。', no_auth: '登录暂未开放。',
  rate_limited: '这个网络登录太频繁了，请过几分钟再试。',
};

const params = new URLSearchParams(location.search);
const wanted = params.get('next');
const next = wanted && /^\/(?!\/)[^\s\\]*$/.test(wanted) && !/^\/(en\/)?login\//.test(wanted) ? wanted : `${prefix}/skins/`;

for (const link of document.querySelectorAll('[data-provider]')) {
  link.href = `/api/auth/login?${new URLSearchParams({ provider: link.dataset.provider, next })}`;
}
const code = params.get('error');
if (code) {
  const box = document.querySelector('#error');
  box.textContent = errors[code] ?? errors.auth_failed;
  box.hidden = false;
}

api('me').then(({ user }) => { if (user) location.replace(user.handle ? next : `${prefix}/settings/?next=${encodeURIComponent(next)}`); }).catch(() => {});
