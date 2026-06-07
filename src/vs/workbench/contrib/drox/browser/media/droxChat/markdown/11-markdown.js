/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

// Mini-renderer markdown (CSP-safe, streaming-friendly) — porté de extension chat.js.

(function (D) {
	const fn = D.fn;

	const MD_INLINE_RX =
		/(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*|_([^\s_][\s\S]*?[^\s_]|[^\s_])_|\[([^\]]+?)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;

	fn.isSafeMarkdownHref = function(url) {
		return /^(https?:|file:|mailto:|#|\/|\.\/|\.\.\/)/i.test(url);
	};

	fn.renderMarkdownInline = function(text, target) {
		let last = 0;
		let m;
		MD_INLINE_RX.lastIndex = 0;
		while ((m = MD_INLINE_RX.exec(text)) !== null) {
			if (m.index > last) {
				target.appendChild(document.createTextNode(text.slice(last, m.index)));
			}
			if (m[1]) {
				const c = document.createElement('code');
				c.textContent = m[2];
				target.appendChild(c);
			} else if (m[3] || m[4]) {
				const b = document.createElement('strong');
				b.textContent = m[3] || m[4];
				target.appendChild(b);
			} else if (m[5]) {
				const s = document.createElement('del');
				s.textContent = m[5];
				target.appendChild(s);
			} else if (m[6] || m[7]) {
				const i = document.createElement('em');
				i.textContent = m[6] || m[7];
				target.appendChild(i);
			} else if (m[8] && m[9] && fn.isSafeMarkdownHref(m[9])) {
				const a = document.createElement('a');
				a.setAttribute('href', m[9]);
				a.setAttribute('target', '_blank');
				a.setAttribute('rel', 'noopener noreferrer');
				a.textContent = m[8];
				target.appendChild(a);
			} else if (m[10] && fn.isSafeMarkdownHref(m[10])) {
				const a = document.createElement('a');
				a.setAttribute('href', m[10]);
				a.setAttribute('target', '_blank');
				a.setAttribute('rel', 'noopener noreferrer');
				a.textContent = m[10];
				target.appendChild(a);
			} else {
				target.appendChild(document.createTextNode(m[0]));
			}
			last = m.index + m[0].length;
		}
		if (last < text.length) {
			target.appendChild(document.createTextNode(text.slice(last)));
		}
	};

	fn.isMarkdownBlockStart = function(line) {
		return (
			/^#{1,6}\s+/.test(line) ||
			/^```/.test(line) ||
			/^\s*([-*+]|\d+\.)\s+/.test(line) ||
			/^>\s?/.test(line) ||
			/^(-{3,}|\*{3,})\s*$/.test(line.trim())
		);
	};

	const CODE_KW = {
		rust: /\b(?:fn|let|mut|pub|use|impl|struct|enum|async|await|return|if|else|match|for|while|true|false|Self|mod|crate)\b/g,
		typescript: /\b(?:const|let|var|function|return|if|else|for|while|async|await|import|export|from|class|interface|type|true|false|null|undefined)\b/g,
		javascript: /\b(?:const|let|var|function|return|if|else|for|while|async|await|import|export|from|class|true|false|null|undefined)\b/g,
		python: /\b(?:def|class|return|if|elif|else|for|while|import|from|as|True|False|None|async|await)\b/g,
	};

	fn.highlightCodeElement = function(codeEl, lang) {
		const raw = codeEl.textContent || '';
		if (!raw) {
			return;
		}
		const key = String(lang || '')
			.toLowerCase()
			.replace(/^lang-/, '')
			.split(/[^a-z0-9+#-]+/)[0];
		const rx =
			CODE_KW[key] ||
			CODE_KW[key === 'ts' ? 'typescript' : ''] ||
			CODE_KW[key === 'js' ? 'javascript' : ''];
		if (!rx) {
			return;
		}
		const frag = document.createDocumentFragment();
		let last = 0;
		rx.lastIndex = 0;
		let m;
		while ((m = rx.exec(raw)) !== null) {
			if (m.index > last) {
				frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
			}
			const kw = document.createElement('span');
			kw.className = 'md-tok-kw';
			kw.textContent = m[0];
			frag.appendChild(kw);
			last = m.index + m[0].length;
		}
		if (last < raw.length) {
			frag.appendChild(document.createTextNode(raw.slice(last)));
		}
		codeEl.replaceChildren(frag);
	};

	fn.renderMarkdown = function(source) {
		const frag = document.createDocumentFragment();
		const lines = String(source ?? '').split(/\r?\n/);
		let i = 0;
		while (i < lines.length) {
			const line = lines[i];

			const fenceMatch = /^```(.*)$/.exec(line);
			if (fenceMatch) {
				const lang = fenceMatch[1].trim();
				const codeLines = [];
				i++;
				while (i < lines.length && !/^```\s*$/.test(lines[i])) {
					codeLines.push(lines[i]);
					i++;
				}
				if (i < lines.length) {
					i++;
				}
				const pre = document.createElement('pre');
				pre.className = 'md-code';
				const code = document.createElement('code');
				if (lang) {
					code.className = 'language-' + lang.replace(/[^a-zA-Z0-9_-]/g, '');
				}
				const joined = codeLines.join('\n');
				code.textContent = joined;
				fn.highlightCodeElement(code, lang);
				pre.appendChild(code);
				frag.appendChild(pre);
				continue;
			}

			const headMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
			if (headMatch) {
				const level = headMatch[1].length;
				const h = document.createElement('h' + level);
				fn.renderMarkdownInline(headMatch[2], h);
				frag.appendChild(h);
				i++;
				continue;
			}

			if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
				frag.appendChild(document.createElement('hr'));
				i++;
				continue;
			}

			if (/^>\s?/.test(line)) {
				const bq = document.createElement('blockquote');
				const buf = [];
				while (i < lines.length && /^>\s?/.test(lines[i])) {
					buf.push(lines[i].replace(/^>\s?/, ''));
					i++;
				}
				fn.renderMarkdownInline(buf.join('\n'), bq);
				frag.appendChild(bq);
				continue;
			}

			if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
				const ordered = /^\s*\d+\.\s+/.test(line);
				const list = document.createElement(ordered ? 'ol' : 'ul');
				while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
					const itemText = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
					const li = document.createElement('li');
					fn.renderMarkdownInline(itemText, li);
					list.appendChild(li);
					i++;
				}
				frag.appendChild(list);
				continue;
			}

			if (line.trim() === '') {
				i++;
				continue;
			}

			const paraBuf = [line];
			i++;
			while (
				i < lines.length &&
				lines[i].trim() !== '' &&
				!fn.isMarkdownBlockStart(lines[i])
			) {
				paraBuf.push(lines[i]);
				i++;
			}
			const p = document.createElement('p');
			fn.renderMarkdownInline(paraBuf.join('\n'), p);
			frag.appendChild(p);
		}
		return frag;
	};

	fn.setAssistantMarkdown = function(el, raw) {
		const text = String(raw ?? '');
		el.dataset.raw = text;
		while (el.firstChild) {
			el.removeChild(el.firstChild);
		}
		el.appendChild(fn.renderMarkdown(text));
	};
})(globalThis.DroxChat);
