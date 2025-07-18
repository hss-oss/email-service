/**
 * 密码哈希加密辅助函数
 * 使用 Web Crypto API (SHA-256)
 * @param {string} password - 明文密码
 * @returns {Promise<string>} - 十六进制格式的哈希值
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

export default {
    /**
     * 主路由和请求处理器
     */
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const isAdmin = url.searchParams.get('admin') === env.ADMIN_UUID;

        // --- API 路由 ---
        if (path === '/api/login-and-fetch' && request.method === 'POST') {
            return this.handleLoginAndFetchRequest(request, env);
        }
        if (path === '/api/mailbox/new' && request.method === 'POST') {
            if (new URL(request.url).searchParams.get('admin') !== env.ADMIN_UUID) {
                 return new Response('Forbidden', { status: 403 });
            }
            return this.handleNewMailboxRequest(env);
        }
        if (path === '/api/user/change-password' && request.method === 'POST') {
            return this.handleChangePasswordRequest(request, env);
        }
        const emailsMatch = path.match(/^\/api\/emails\/([a-zA-Z0-9\-]+)$/);
        if (emailsMatch && isAdmin) {
            const mailboxCode = emailsMatch[1];
            return this.handleAdminEmailsRequest(mailboxCode, env);
        }

        // --- 主页面渲染 ---
        const domain = env.MY_DOMAIN;
        if (!domain) return new Response('Server configuration error: MY_DOMAIN is not set.', { status: 500 });
        
        return new Response(generateAppHtml(domain, isAdmin), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
    },

    /**
     * API: 用户登录并获取邮件
     */
    async handleLoginAndFetchRequest(request, env) {
        try {
            const { mailbox_code, password } = await request.json();
            if (!mailbox_code || !password) return new Response('Missing credentials', { status: 400 });

            const userStmt = env.DB.prepare('SELECT password_hash FROM users WHERE mailbox_code = ?');
            const user = await userStmt.bind(mailbox_code).first();
            if (!user) return new Response('Unauthorized', { status: 401 });

            const inputPasswordHash = await hashPassword(password);
            if (inputPasswordHash !== user.password_hash) return new Response('Unauthorized', { status: 401 });

            const emailsStmt = env.DB.prepare('SELECT from_address, subject, received_at, body_html, body_text FROM emails WHERE mailbox_code = ? ORDER BY received_at DESC');
            const { results } = await emailsStmt.bind(mailbox_code).all();
            return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });

        } catch (e) {
            console.error("Login/Fetch Error:", e);
            return new Response('Internal Server Error', { status: 500 });
        }
    },
    
    /**
     * API: 管理员获取任意邮箱的邮件
     */
    async handleAdminEmailsRequest(mailboxCode, env) {
        try {
            const emailsStmt = env.DB.prepare('SELECT from_address, subject, received_at, body_html, body_text FROM emails WHERE mailbox_code = ? ORDER BY received_at DESC');
            const { results } = await emailsStmt.bind(mailboxCode).all();
            return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            console.error("Admin Fetch Error:", e);
            return new Response('Internal Server Error', { status: 500 });
        }
    },

    /**
     * API: 管理员创建新邮箱账户
     */
    async handleNewMailboxRequest(env) {
        const adjectives = ["swift", "clever", "silent", "wise", "brave", "calm", "eager", "jolly"];
        const nouns = ["fox", "river", "moon", "star", "forest", "mountain", "ocean", "cloud"];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 900) + 100;
        const newCode = `${adj}-${noun}-${num}`;
        const initialPassword = '111111';
        const passwordHash = await hashPassword(initialPassword);

        try {
            const stmt = env.DB.prepare('INSERT INTO users (mailbox_code, password_hash, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))');
            await stmt.bind(newCode, passwordHash).run();
            
            return new Response(JSON.stringify({ new_code: newCode, initial_password: initialPassword }), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e) {
            console.error("Create user error:", e);
            return new Response('Failed to create user, please try again.', { status: 500 });
        }
    },

    /**
     * API: 用户修改密码
     */
    async handleChangePasswordRequest(request, env) {
        try {
            const { mailbox_code, current_password, new_password } = await request.json();
            if (!mailbox_code || !current_password || !new_password) {
                return new Response('Missing parameters', { status: 400 });
            }

            const userStmt = env.DB.prepare('SELECT password_hash FROM users WHERE mailbox_code = ?');
            const user = await userStmt.bind(mailbox_code).first();
            if (!user) return new Response('User not found', { status: 404 });

            const currentPasswordHash = await hashPassword(current_password);
            if (currentPasswordHash !== user.password_hash) {
                return new Response('Incorrect current password', { status: 403 });
            }

            const newPasswordHash = await hashPassword(new_password);
            const updateStmt = env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE mailbox_code = ?');
            await updateStmt.bind(newPasswordHash, mailbox_code).run();

            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });

        } catch (e) {
            console.error("Change Password Error:", e);
            return new Response('Internal Server Error', { status: 500 });
        }
    },

    /**
     * Email handler: 接收邮件并存入数据库
     */
    async email(message, env) {
        const mailboxCode = message.to.split('@')[0];
        if (!mailboxCode) { return; }
        try {
            const PostalMime = (await import('postal-mime')).default;
            const parser = new PostalMime();
            const email = await parser.parse(message.raw);
            const stmt = env.DB.prepare(
                'INSERT INTO emails (mailbox_code, message_id, from_address, to_address, subject, body_html, body_text) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            await stmt.bind(
                mailboxCode, message.headers.get('message-id'), email.from?.address || 'n/a',
                message.to, email.subject || '(No Subject)', email.html || '', email.text || ''
            ).run();
        } catch (e) { console.error('Email handler error:', e); }
    },
};

/**
 * 根据是否为管理员，生成不同权限的前端页面
 */
function generateAppHtml(domain, isAdmin) {
    return `
		<!DOCTYPE html>
		<html lang="zh-CN">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>临时邮箱</title>
				<script src="https://cdn.tailwindcss.com"></script>
				<script type="module" src="https://cdn.jsdelivr.net/npm/ionicons@latest/dist/ionicons/ionicons.esm.js"></script>
				<script nomodule src="https://cdn.jsdelivr.net/npm/ionicons@latest/dist/ionicons/ionicons.js"></script>
				<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css">
				<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/toastify-js"></script>
				<style>
					body { font-family: 'Inter', sans-serif, 'PingFang SC', 'Microsoft YaHei'; }
					.custom-scrollbar::-webkit-scrollbar { width: 6px; }
					.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
					.custom-scrollbar::-webkit-scrollbar-thumb { background: #9ca3af; border-radius: 3px; }
					.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
				</style>
			</head>
			<body class="bg-slate-100 flex items-center justify-center min-h-screen">
				
				<!-- 主应用界面 -->
				<main id="app-main" class="w-full max-w-6xl mx-auto my-8 bg-white rounded-2xl shadow-xl flex ${!isAdmin ? 'hidden' : ''}" style="height: 85vh;">
					<aside class="w-1/3 border-r border-slate-200 flex flex-col">
						<div class="p-4 border-b border-slate-200">
							<h2 class="text-lg font-semibold text-slate-800 mb-3">您的临时邮箱</h2>
							<div class="relative flex items-center">
								<input id="current-email" type="text" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm text-slate-700 focus:outline-none">
								<button onclick="copyToClipboard()" class="absolute right-2 p-1 text-slate-500 hover:text-slate-800 transition-colors" title="复制到剪贴板">
									<ion-icon name="clipboard-outline" class="text-lg"></ion-icon>
								</button>
							</div>
							<div class="grid grid-cols-3 gap-2 mt-3">
								${isAdmin ? `
								<button onclick="generateNewMailbox()" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
									<ion-icon name="add-circle-outline" class="text-lg"></ion-icon> 新建
								</button>
								<button onclick="startRecovery()" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
									<ion-icon name="repeat-outline" class="text-lg"></ion-icon> 恢复
								</button>
								<button onclick="fetchEmails(true)" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors">
									<ion-icon name="refresh-outline" class="text-lg"></ion-icon> 刷新
								</button>
								` : `
                                <button onclick="showChangePasswordModal()" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors col-span-2">
									<ion-icon name="key-outline" class="text-lg"></ion-icon> 修改密码
								</button>
                                <button onclick="fetchEmails(true)" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors">
									<ion-icon name="refresh-outline" class="text-lg"></ion-icon> 刷新
								</button>
                                `}
							</div>
						</div>
						<div class="flex-grow overflow-y-auto custom-scrollbar">
							<ul id="inbox-list" class="divide-y divide-slate-200"></ul>
						</div>
					</aside>
					<section class="w-2/3 flex flex-col">
						<div id="email-placeholder" class="flex-grow flex flex-col items-center justify-center text-slate-400">
							<ion-icon name="mail-outline" class="text-6xl mb-4"></ion-icon>
							<p class="text-lg">请从左侧选择一封邮件进行查看</p>
						</div>
						<div id="email-content-view" class="hidden flex-grow flex flex-col bg-white">
							<div id="email-header" class="p-4 border-b border-slate-200 bg-slate-50"></div>
							<iframe id="email-iframe" class="flex-grow w-full border-0"></iframe>
						</div>
					</section>
				</main>

				<!-- 各种模态框 -->
				${isAdmin ? `
				<div id="recoveryModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center">
				  <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
					<div class="flex justify-between items-center mb-4">
						<h5 class="text-xl font-bold text-slate-800">恢复邮箱</h5>
						<button onclick="closeRecovery()" class="text-slate-400 hover:text-slate-700">
							<ion-icon name="close-outline" class="text-2xl"></ion-icon>
						</button>
					</div>
					<div class="modal-body">
					  <p class="text-slate-600 mb-3">请输入恢复码来找回任意邮箱。</p>
					  <input type="text" id="recovery-key-input" class="w-full border border-slate-300 rounded-lg p-2" placeholder="在此粘贴恢复码">
					</div>
					<div class="modal-footer mt-6 flex justify-end gap-3">
						<button type="button" class="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg" onclick="closeRecovery()">关闭</button>
						<button type="button" class="px-4 py-2 bg-blue-500 text-white rounded-lg" onclick="performRecovery()">恢复</button>
					</div>
				  </div>
				</div>` : ''}
				
				<div id="loginModal" class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm text-center ${isAdmin ? 'hidden' : ''}">
					<h5 class="text-2xl font-bold text-slate-800 mb-2">欢迎使用临时邮箱</h5>
					<p class="text-slate-600 mb-6">请输入您的邮箱码和密码。</p>
					<div class="space-y-4">
						<input type="text" id="login-key-input" class="w-full border border-slate-300 rounded-lg p-3 text-center" placeholder="邮箱码 (例如: clever-fox-123)">
						<input type="password" id="login-password-input" class="w-full border border-slate-300 rounded-lg p-3 text-center" placeholder="密码">
					</div>
					<button id="login-button" class="mt-6 w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all">进入邮箱</button>
					<p id="login-error" class="text-red-500 text-sm mt-3 h-4"></p>
				</div>
                
				<div id="changePasswordModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center">
					<div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
						<div class="flex justify-between items-center mb-4">
							<h5 class="text-xl font-bold text-slate-800">修改密码</h5>
							<button onclick="closeChangePasswordModal()" class="text-slate-400 hover:text-slate-700">
								<ion-icon name="close-outline" class="text-2xl"></ion-icon>
							</button>
						</div>
						<div class="modal-body space-y-4">
							<input type="password" id="current-password" class="w-full border border-slate-300 rounded-lg p-2" placeholder="当前密码">
							<input type="password" id="new-password" class="w-full border border-slate-300 rounded-lg p-2" placeholder="新密码">
							<input type="password" id="confirm-password" class="w-full border border-slate-300 rounded-lg p-2" placeholder="确认新密码">
						</div>
						<p id="password-error" class="text-red-500 text-sm mt-2 h-4"></p>
						<div class="modal-footer mt-6 flex justify-end gap-3">
							<button type="button" class="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg" onclick="closeChangePasswordModal()">取消</button>
							<button type="button" class="px-4 py-2 bg-blue-500 text-white rounded-lg" onclick="performPasswordChange()">确认修改</button>
						</div>
					</div>
				</div>

				<script>
					const DOMAIN = '${domain}'; const IS_ADMIN = ${isAdmin};
					let currentMailboxCode = null; let currentUserPassword = null; 
                    let emailsCache = []; let refreshInterval = null;
                    const urlParams = new URLSearchParams(window.location.search);
                    const adminUUID = urlParams.get('admin');
					
                    /**
                     * 页面加载完成后的初始化函数
                     */
					document.addEventListener('DOMContentLoaded', () => {
						if (IS_ADMIN) {
							// 管理员模式：自动生成一个码或从localStorage恢复
							let savedCode = localStorage.getItem('adminLastMailboxCode');
							if (!savedCode) { generateNewMailbox(false); } else { setMailbox(savedCode); }
						} else {
							// 普通用户模式：为登录框绑定事件
							document.getElementById('login-button').onclick = () => performLogin(false);
                            document.getElementById('login-key-input').onkeyup = (e) => { if (e.key === 'Enter') performLogin(false); };
							document.getElementById('login-password-input').onkeyup = (e) => { if (e.key === 'Enter') performLogin(false); };
						}
						startAutoRefresh();
					});

                    /**
                     * 设置当前邮箱，并触发邮件获取
                     * @param {string} code - 邮箱码
                     */
					function setMailbox(code) {
						currentMailboxCode = code;
						if (IS_ADMIN) localStorage.setItem('adminLastMailboxCode', code);
						const emailAddress = \`\${code}@\${DOMAIN}\`;
						document.getElementById('current-email').value = emailAddress;
						fetchEmails(true);
					}

                    /**
                     * 获取邮件列表
                     * @param {boolean} isManual - 是否为手动触发
                     */
					async function fetchEmails(isManual=false){
						if(!currentMailboxCode) return;
                        const refreshBtn = document.querySelector('button[onclick="fetchEmails(true)"]');
                        if (isManual && refreshBtn) {
                            const originalContent = refreshBtn.innerHTML;
                            refreshBtn.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';
                            refreshBtn.disabled = true;
                            setTimeout(() => { 
                                refreshBtn.innerHTML = originalContent;
                                refreshBtn.disabled = false;
                            }, 1000);
                        }

                        if (IS_ADMIN) {
                            try {
                                const response = await fetch(\`/api/emails/\${currentMailboxCode}?admin=\${adminUUID}\`);
                                if(!response.ok) throw new Error('Failed to fetch');
                                const emails = await response.json();
                                emailsCache = emails;
                                renderInbox();
                            } catch(e) { console.error('Error fetching emails:', e); }
                        } else {
                            if (!currentUserPassword) return; 
                            await performLogin(true);
                        }
					}

                    /**
                     * 将邮件数据渲染到收件箱列表
                     */
					function renderInbox() {
                        const inboxList = document.getElementById('inbox-list');
                        if (emailsCache.length === 0) {
                            inboxList.innerHTML = '<li class="p-8 text-center text-slate-500">您的收件箱是空的</li>';
                            return;
                        }
                        inboxList.innerHTML = emailsCache.map((email, index) => \`
							<li onclick="showEmail(\${index})" class="p-4 cursor-pointer hover:bg-slate-50" data-index="\${index}">
								<div class="flex justify-between items-center">
									<p class="font-semibold text-slate-800 text-sm truncate">\${escapeHtml(email.from_address)}</p>
									<p class="text-xs text-slate-400">\${new Date(email.received_at.replace(' ', 'T') + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
								</div>
								<p class="text-sm text-slate-600 truncate">\${escapeHtml(email.subject)}</p>
							</li>
						\`).join('');
                    }
                    
                    /**
                     * 显示指定邮件的详细内容
                     * @param {number} index - 邮件在缓存数组中的索引
                     */
					function showEmail(index) {
                        const email = emailsCache[index];
                        if (!email) return;
                        document.querySelectorAll('#inbox-list li').forEach(li => {
                            li.classList.toggle('bg-blue-50', li.dataset.index == index);
                        });
                        document.getElementById('email-placeholder').classList.add('hidden');
                        const view = document.getElementById('email-content-view');
                        view.classList.remove('hidden'); view.classList.add('flex');
                        const header = document.getElementById('email-header');
                        header.innerHTML = \`<h3 class="font-bold text-lg text-slate-900 truncate">\${escapeHtml(email.subject)}</h3><p class="text-sm text-slate-600 mt-1"><strong>发件人:</strong> \${escapeHtml(email.from_address)}</p>\`;
                        const iframe = document.getElementById('email-iframe');
                        const content = email.body_html || \`<pre style="white-space: pre-wrap; word-wrap: break-word; padding: 1rem; font-family: monospace;">\${escapeHtml(email.body_text)}</pre>\`;
                        iframe.srcdoc = content;
                    }

                    /**
                     * (管理员) 创建一个新的邮箱账户
                     * @param {boolean} confirmFirst - 是否需要弹出确认框
                     */
					async function generateNewMailbox(confirmFirst = true) {
						if (!IS_ADMIN) return;
						if (confirmFirst && !confirm('您确定要生成一个新的邮箱账户吗？')) return;
						try {
                            const apiUrl = \`/api/mailbox/new?admin=\${adminUUID}\`;
							const response = await fetch(apiUrl, { method: 'POST' });
							const data = await response.json();
							if (data.new_code) {
								setMailbox(data.new_code);
								Toastify({ text: \`创建成功!\\n邮箱码: \${data.new_code}\\n初始密码: \${data.initial_password}\`, duration: 10000, gravity: "top", position: "center" }).showToast();
							}
						} catch(e) { console.error("Failed to generate new mailbox", e); }
					}

                    /**
                     * (管理员) 恢复/查看任意邮箱
                     */
					function startRecovery(){ document.getElementById('recoveryModal').classList.remove('hidden'); document.getElementById('recoveryModal').classList.add('flex'); }
					function closeRecovery(){ document.getElementById('recoveryModal').classList.add('hidden'); document.getElementById('recoveryModal').classList.remove('flex'); }
					function performRecovery(){ const key = document.getElementById('recovery-key-input').value.trim(); if (key) { setMailbox(key); closeRecovery(); } }
					
                    /**
                     * (普通用户) 执行登录或刷新操作
                     * @param {boolean} isRefresh - 是否为刷新操作
                     */
					async function performLogin(isRefresh = false) {
						const loginInput = document.getElementById('login-key-input');
						const passwordInput = document.getElementById('login-password-input');
						const loginError = document.getElementById('login-error');
						
						const code = isRefresh ? currentMailboxCode : loginInput.value.trim();
						const password = isRefresh ? currentUserPassword : passwordInput.value.trim();

						if (!code || !password) { loginError.textContent = '请输入邮箱码和密码。'; return; }
						loginError.textContent = '';

						try {
							const response = await fetch('/api/login-and-fetch', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ mailbox_code: code, password: password })
							});

							if (response.ok) {
                                if (!isRefresh) {
                                    document.getElementById('loginModal').classList.add('hidden');
                                    document.getElementById('app-main').classList.remove('hidden');
                                    currentUserPassword = password;
                                }
								const emails = await response.json();
								emailsCache = emails;
                                if (!isRefresh) setMailbox(code);
								renderInbox();
							} else {
								loginError.textContent = '邮箱码或密码错误，请确认。';
							}
						} catch (e) { loginError.textContent = '验证时发生错误，请稍后重试。'; }
					}

                    /**
                     * (普通用户) 修改密码
                     */
                    function showChangePasswordModal() { document.getElementById('changePasswordModal').classList.remove('hidden'); document.getElementById('changePasswordModal').classList.add('flex'); }
                    function closeChangePasswordModal() { document.getElementById('changePasswordModal').classList.add('hidden'); document.getElementById('changePasswordModal').classList.remove('flex'); }
                    async function performPasswordChange() {
                        const currentPasswordEl = document.getElementById('current-password');
                        const newPasswordEl = document.getElementById('new-password');
                        const confirmPasswordEl = document.getElementById('confirm-password');
                        const passwordErrorEl = document.getElementById('password-error');
                        
                        const current_password = currentPasswordEl.value;
                        const new_password = newPasswordEl.value;
                        const confirm_password = confirmPasswordEl.value;

                        passwordErrorEl.textContent = '';
                        if (!current_password || !new_password || !confirm_password) {
                            passwordErrorEl.textContent = '所有字段都必须填写。'; return;
                        }
                        if (new_password !== confirm_password) {
                            passwordErrorEl.textContent = '两次输入的新密码不一致。'; return;
                        }

                        try {
                            const response = await fetch('/api/user/change-password', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ mailbox_code: currentMailboxCode, current_password, new_password })
                            });
                            if (response.ok) {
                                Toastify({ text: "密码修改成功！", style: { background: "linear-gradient(to right, #00b09b, #96c93d)" } }).showToast();
                                currentUserPassword = new_password;
                                closeChangePasswordModal();
                            } else {
                                const errorText = await response.text();
                                passwordErrorEl.textContent = errorText === 'Incorrect current password' ? '当前密码错误。' : '修改失败，请重试。';
                            }
                        } catch (e) {
                            passwordErrorEl.textContent = '请求失败，请检查网络。';
                        }
                    }

                    /**
                     * 通用辅助函数
                     */
                    function copyToClipboard(){ const email = document.getElementById('current-email').value; navigator.clipboard.writeText(email).then(() => { Toastify({ text: "邮箱地址已复制到剪贴板", duration: 3000, gravity: "top", position: "right", style: { background: "linear-gradient(to right, #00b09b, #96c93d)" }}).showToast(); }); }
                    function startAutoRefresh(){ if (refreshInterval) clearInterval(refreshInterval); setInterval(() => { if (currentMailboxCode) fetchEmails(true); }, 30000); }
                    function escapeHtml(unsafe){ if(!unsafe) return ''; return unsafe.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
                    function showPlaceholder(){ document.getElementById('email-placeholder').classList.remove('hidden'); const view = document.getElementById('email-content-view'); view.classList.add('hidden'); view.classList.remove('flex'); }
				</script>
			</body>
		</html>
	`;
}
