// ==UserScript==
// @name         時雨の町
// @namespace    http://tampermonkey.net/
// @version      2024-11-14
// @description  try to take over the world!
// @author       GuanXin
// @match        https://www.sigure.tw/learn-japanese/vocabulary/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sigure.tw
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    console.log('時雨の町');

    // 获取所有需要处理的表格
    const tables = document.querySelectorAll('.word');

    tables.forEach(table => {
        // 在每个表头单元格后面添加一个开关
        const headers = table.querySelectorAll('thead th');
        headers.forEach((header, index) => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            header.appendChild(checkbox);

            // 给开关绑定事件处理器
            checkbox.addEventListener('change', (event) => {
                // 根据开关状态选择相应的列并应用或移除样式
                console.log(`enable ${index}`);
                const cells = table.querySelectorAll(`tbody tr td:nth-child(${index + 1})`);
                if (event.target.checked) {
                    cells.forEach(cell => {
                        cell.classList.add('hidden-content');
                    });
                } else {
                    cells.forEach(cell => {
                        cell.classList.remove('hidden-content');
                    });
                }
            });
        });

        // 动态添加CSS规则
        const style = document.createElement('style');
        style.innerHTML = `
            .hidden-content {
                position: relative;
            }
            .hidden-content::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: black;
                opacity: 1;
                transition: opacity 0.3s ease;
            }
            .hidden-content:hover::before {
                opacity: 0;
            }
        `;
        document.head.appendChild(style);
    });
})();

