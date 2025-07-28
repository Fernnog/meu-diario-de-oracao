/* ==== GOOGLE FONTS ==== */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');

/* ==== TOP BAR (Optional Backup Info) ==== */
.top-bar {
    padding: 10px 20px;
    text-align: right;
    overflow: auto;
}

.ultimo-backup {
    font-size: 0.8em;
    color: #666;
    padding: 5px 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: #f5f5f5;
    float: right;
    clear: right;
}

/* ==== USER STATUS (Barra Superior) - MELHORIA PRIORIDADE 1 ==== */
.user-status-top {
    float: right;
    padding: 5px 15px;
    font-size: 0.9em;
    color: #555;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 15px;
    margin-left: 15px;
    display: none; /* Oculto por padrão, ativado via JS */
}


/* ==== LOGO STYLES ==== */
.logo-container {
    text-align: center;
    margin-top: 20px;
    margin-bottom: 30px;
}

.logo {
    max-width: 100%;
    height: auto;
    max-height: 150px;
}

/* ==== GENERAL STYLES ==== */
html, body {
    max-width: 100%;
    overflow-x: hidden;
    scroll-padding-top: 20px; /* MELHORIA UX: Garante espaço ao rolar para âncoras */
}

body {
    font-family: 'Playfair Display', serif;
    margin: 0;
    padding: 10px;
    background-color: #f9f9f9;
    color: #333;
}

.main-title {
    text-align: center;
    margin-bottom: 10px;
}

h1 {
    color: #333;
    font-size: 2.5em;
}

/* ==== BUTTON STYLES ==== */
.main-menu {
    text-align: center;
    margin-bottom: 20px;
}

/* General Button Style */
.btn {
    margin: 10px 5px;
    padding: 10px 20px;
    color: #fff;
    border: none;
    cursor: pointer;
    border-radius: 5px;
    font-size: 14px;
    font-family: 'Playfair Display', serif; /* Ensure font */
    transition: background-color 0.3s, color 0.3s, box-shadow 0.3s; /* Added box-shadow for potential effects */
}

.btn:hover {
    /* Hover effects defined per button type below */
}

/* Primary Menu Buttons (Orange) */
.main-menu button, .main-menu .btn {
    background-color: #e29420;
}
.main-menu button:hover, .main-menu .btn:hover {
    background-color: #ca7d1b; /* Darker orange */
}

/* View Buttons (Dark Brown) */
.generate-view, .daily-view {
    background-color: #7a5217;
}
.generate-view:hover, .daily-view:hover {
    background-color: #5f4012;
}

/* Archived/Resolved Buttons (Grey) */
.archived-resolved {
    background-color: #948484;
}
.archived-resolved:hover {
    background-color: #756b6b;
}

/* Action Buttons (Darkest Brown) */
.main-menu .action-btn {
    background-color: #654321;
}
.main-menu .action-btn:hover {
    background-color: #4a301a;
}

/* Daily Section Action Buttons */
.daily-action-btn {
    background-color: #654321; /* Darkest Brown */
    color: #fff;
}
.daily-action-btn:hover {
    background-color: #4a301a; /* Darkest Brown (Hover) */
}

/* Submit Button in Add Target Form */
.submit-btn {
     background-color: #654321; /* Darkest Brown */
     color: #fff;
}
.submit-btn:hover {
     background-color: #4a301a; /* Darkest Brown (Hover) */
}

/* Close Button in Completion Popup */
.popup .btn {
    background-color: #948484; /* Grey */
    color: #fff;
}
.popup .btn:hover {
     background-color: #756b6b; /* Grey (Hover) */
}


/* Separator Lines */
hr.menu-separator {
    border: none;
    border-top: 2px solid #e29420; /* Orange */
    margin: 20px auto;
    width: 80%;
}
hr.menu-separator.dark {
    border-top: 2px solid #654321; /* Dark Brown */
}
hr.section-separator {
    border: none;
    border-top: 1px solid #ddd; /* Light Grey */
    margin: 30px auto;
    width: 80%;
}
hr.title-separator, hr.search-separator, hr.filter-separator {
     border: none;
     border-top: 1px solid #eee; /* Very light separator */
     margin: 15px auto;
     width: 80%;
 }

/* ==== SECTION STYLES ==== */
.form-section, .targets-section, .daily-section, .completed-daily-targets-section {
    margin: 20px auto; /* Center sections */
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 5px;
    background-color: #fff; /* Default background for most sections */
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    text-align: center;
    width: 95%; /* Responsive width */
    max-width: 800px; /* Max width */
}

.perseverance-section, .weekly-perseverance-chart {
    margin: 20px auto;
    padding: 15px;
    border: 1px solid #e6ccb2; /* Lighter brown border */
    border-radius: 8px; /* Slightly more rounded */
    background-color: #fff0db; /* Light peach/orange tint - MAIS VIVA */
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
    text-align: center;
    width: 95%;
    max-width: 800px;
}

/* ==== PAINEL DE PRIORIDADES ==== */
.priority-section {
    margin: 20px auto;
    padding: 15px;
    border: 1px solid #FFD54F; /* Borda dourada sutil */
    border-radius: 5px;
    background-color: #FFFDE7; /* Fundo amarelo muito claro */
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
    text-align: center;
    width: 95%;
    max-width: 800px;
}

.priority-section h2 {
    color: #6D4C41; /* Tom de marrom */
    margin-bottom: 15px;
}

#priorityTargetsList .target {
    background-color: #fff;
    border-left: 4px solid #FBC02D; /* Destaque na borda esquerda */
    text-align: left;
}

/* Ícone de estrela para alvos prioritários */
.priority-target-item h3::before {
    content: '⭐';
    margin-right: 8px;
    font-size: 1.1em;
}

/* ==== AÇÕES E MENSAGENS NO PAINEL DE PRIORIDADES ==== */
.priority-target-item .priority-target-actions {
    margin-top: 10px;
    text-align: left; /* MODIFICADO: Alinha o botão à esquerda */
}

#priorityTargetsList .empty-message {
    color: #666;
    font-style: italic;
    padding: 20px;
    background-color: #fff9e7;
    border: 1px dashed #e29420;
    border-radius: 4px;
    text-align: center;
}


/* ==== INPUT STYLES ==== */
input[type="text"],
input[type="email"],
input[type="password"],
input[type="date"],
textarea,
select
{
    display: block;
    margin: 10px auto;
    padding: 10px;
    width: 80%;
    max-width: 400px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-family: 'Playfair Display', serif;
    box-sizing: border-box; /* Include padding in width calculation */
}

textarea {
    resize: vertical;
    min-height: 70px;
}

.search-input {
    margin: 10px auto 15px auto;
    padding: 8px;
    width: 80%;
    max-width: 300px;
    display: block;
}

/* Style for left date icon */
input[type="date"] {
    padding-left: 30px;
    background-repeat: no-repeat;
    background-position: 5px center;
    background-size: 20px;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="%23555"><path d="M464 64H48C21.49 64 0 85.49 0 112v336c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49-48-48V112c0-26.51-21.49-48-48-48zM48 96h416c8.822 0 16 7.178 16 16v48H32v-48c0-8.822 7.178-16 16-16zM464 480H48c-8.822 0-16-7.178-16-16v-288h448v288c0 8.822-7.178 16-16 16zM128 192h64v64h-64zM288 192h64v64h-64zM128 288h64v64h-64zM288 288h64v64h-64z"/></svg>');
}

/* Checkbox specific styling */
.checkbox-container {
    display: flex;
    align-items: center;
    justify-content: center; /* Center if a single item, or use for multiple */
    margin: 10px auto;
    width: 80%;
    max-width: 400px;
}

.checkbox-container input[type="checkbox"] {
    display: inline-block;
    width: auto;
    margin-right: 8px;
    vertical-align: middle;
}

.checkbox-container label {
    display: inline;
    font-weight: normal;
    text-align: left;
    margin: 0;
    cursor: pointer;
    vertical-align: middle;
}


/* ==== TARGET STYLES ==== */
.target {
    border-bottom: 1px solid #ddd;
    padding: 15px 10px;
    text-align: left;
    margin-bottom: 10px;
}

.target:last-child {
    border-bottom: none;
}

/* Target Heading (H3) with Tags */
.target h3 {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px; /* Space between tags and title */
    margin-top: 0;
    margin-bottom: 8px;
}

.target h3 .category-tag,
.target h3 .deadline-tag {
    flex-shrink: 0; /* Prevent tags from shrinking */
}

/* Estilo para o parágrafo da data de criação */
.target-creation-info {
    margin-top: 8px;
    margin-bottom: 8px;
}

/* Target Actions & Buttons */
.target-actions {
     margin-top: 10px;
     display: flex;
     flex-wrap: wrap;
     gap: 5px;
}
.target .btn { /* Buttons inside targets */
     padding: 8px 12px;
     font-size: 13px;
     margin: 0;
}

.target button.resolved {
    background-color: #9cbe4a; /* Green */
}
.target button.resolved:hover {
    background-color: #85a739;
}

.target button.archive {
    background-color: #c97272; /* Light Red */
}
.target button.archive:hover {
    background-color: #a65b5b;
}

.target button.add-observation {
    background-color: #73a8f3; /* Light Blue */
}
.target button.add-observation:hover {
    background-color: #5a8ccb;
}

/* BOTÃO DE ALTERNAR PRIORIDADE */
.target button.toggle-priority {
    background-color: #42A5F5; /* Azul */
    color: white;
}
.target button.toggle-priority:hover {
    background-color: #1E88E5;
}
.target button.toggle-priority.is-priority {
    background-color: #FFA726; /* Laranja/Dourado quando já é prioridade */
}
.target button.toggle-priority.is-priority:hover {
    background-color: #FB8C00;
}

/* CORREÇÃO APLICADA: Botão de Editar Prazo */
.target button.edit-deadline {
    background-color: #ffb74d; /* Laranja suave */
    color: #333;
}
.target button.edit-deadline:hover {
    background-color: #ffa726; /* Laranja mais forte */
}

.target button.edit-category {
    background-color: #C71585; /* MediumVioletRed / Fuchsia */
    color: white;
}
.target button.edit-category:hover {
    background-color: #A01069; /* Darker Tone */
}

.target button.delete { /* Delete button in Archived */
    background-color: #d9534f; /* Red */
}
.target button.delete:hover {
    background-color: #c9302c;
}

/* Botão de Download para alvos arquivados */
.target button.download {
    background-color: #3498db; /* Azul */
}
.target button.download:hover {
    background-color: #2980b9; /* Azul mais escuro */
}


/* Styling for different target views/states */
.resolved { /* Targets in Resolved panel AND Archived panel if resolved */
    background-color: #eaffea; /* Light green background */
    border-left: 3px solid #9cbe4a; /* Green left border */
    padding-left: 10px;
}
.archived { /* Targets in Archived panel */
     background-color: #f8f8f8; /* Light grey background */
     opacity: 0.9;
}

/* Resolved Tag Style */
.resolved-tag {
    background-color: #DCEDC8;
    color: #558B2F;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: bold;
    margin-right: 5px;
    border: 1px solid #AED581;
    vertical-align: middle;
}


/* Daily Targets Styling */
#dailyTargets .target {
     background-color: #fff;
     padding: 12px;
     border: 1px solid #eee;
     border-radius: 4px;
     box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
#dailyTargets .target:nth-child(odd) {
    background-color: rgba(249, 168, 37, 0.05); /* Very light orange tint */
}

#dailyTargets .target h3::before {
    content: '☀️';
    margin-right: 8px;
    font-size: 1.1em;
    vertical-align: middle;
}

/* Add/Edit Form Styles (within targets) */
.add-observation-form,
.edit-deadline-form,
.edit-category-form
{
    margin-top: 10px;
    padding: 10px;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 5px;
}

.edit-deadline-form {
    display: none; /* This class is no longer used for inline forms */
}


.add-observation-form textarea,
.add-observation-form input[type="date"],
.edit-category-form select
{
    width: calc(100% - 22px);
    max-width: none;
    margin: 0 auto 10px auto;
    display: block;
    box-sizing: border-box;
}

.add-observation-form .btn,
.edit-category-form .btn
{
    margin: 5px;
    display: inline-block;
    color: #fff;
    padding: 8px 12px;
    font-size: 14px;
}

/* Specific button colors for forms */
.add-observation-form .btn { background-color: #7cb17c; }
.add-observation-form .btn:hover { background-color: #649464; }

.edit-category-form .save-category-btn { background-color: #4CAF50; }
.edit-category-form .save-category-btn:hover { background-color: #45a049; }
.edit-category-form .cancel-category-btn { background-color: #f44336; }
.edit-category-form .cancel-category-btn:hover { background-color: #da190b; }


/* Observation Display Styles */
.observations {
    margin-top: 10px;
    padding-left: 10px;
    border-left: 2px solid #eee;
}
.observation-item, .target-details {
    margin-left: 0;
    font-size: 0.9em;
    color: #555;
    padding-left: 0;
    margin-bottom: 5px;
    text-align: justify;
}
.observation-item strong { /* Date part */
     color: #444;
}

/* ==== INÍCIO: ESTILOS PARA SUB-ALVOS E OBSERVAÇÕES ANINHADAS ==== */
/* Ícone indicador de sub-alvo no título do alvo principal */
.sub-target-indicator {
    font-size: 1em;
    margin-right: 8px;
    vertical-align: middle;
    cursor: help;
}

/* Estilo para a observação que foi promovida a sub-alvo */
.observation-item.sub-target {
    background-color: #eaf6ff; /* Azul pastel claro para destaque */
    border: 1px solid #bbdefb; /* Borda azul mais suave */
    border-left: 4px solid #3498db; /* Borda azul mais escura à esquerda */
    padding: 12px;
    margin-top: 10px; /* Mais espaço para se destacar */
    border-radius: 4px;
}

/* Estilo para um sub-alvo que foi marcado como respondido */
.observation-item.sub-target.resolved {
    background-color: #e8f5e9; /* Verde claro para resolvido */
    border-color: #c8e6c9;
    border-left-color: #66bb6a;
    opacity: 0.8; /* Suaviza a aparência */
}

/* Container para o título e botões de ação do sub-alvo */
.sub-target-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap; /* Garante que os botões quebrem a linha em telas pequenas */
    gap: 8px;
    margin-bottom: 8px;
}

/* Título do sub-alvo */
.sub-target-title {
    font-weight: bold;
    color: #5d4037; /* Tom de marrom */
    font-size: 1.05em;
}

.sub-target-title::before {
    content: '🎯'; /* Ícone de alvo para identificação rápida */
    margin-right: 6px;
}

/* Container para os botões de ação dentro de uma observação */
.observation-actions {
    margin-top: 8px;
    display: flex;
    gap: 5px;
    align-items: center;
}

/* Estilo base para os botões pequenos dentro das observações */
.observation-actions .btn-small {
    padding: 4px 10px; /* Menor que os botões principais */
    font-size: 11px;
    font-family: 'Playfair Display', serif;
    border: 1px solid #ccc;
    background-color: #f5f5f5;
    color: #333;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s, border-color 0.2s;
}

.observation-actions .btn-small:hover {
    border-color: #999;
}

/* Variações de cor para os botões de ação */
.observation-actions .btn-small.promote {
    background-color: #ffecb3; /* Amarelo claro para "Promover" */
    border-color: #ffe082;
}

.observation-actions .btn-small.resolve {
    background-color: #a5d6a7; /* Verde claro para "Marcar Respondido" */
    border-color: #81c784;
}

.observation-actions .btn-small.edit {
    background-color: #bbdefb; /* Azul claro para "Editar" */
    border-color: #90caf9;
}

.observation-actions .btn-small.demote {
    background-color: #e0e0e0; /* Cinza para "Reverter" */
    border-color: #bdbdbe;
}

/* Span para texto 'Respondido' quando não há mais botão de ação */
.sub-target-header .resolved-tag {
    font-size: 0.9em;
    font-weight: bold;
    color: #2e7d32;
    padding: 4px 8px;
    background-color: #c8e6c9;
    border-radius: 4px;
}

/* Container para a lista de observações de um sub-alvo */
.sub-observations-list {
    margin-top: 10px;
    padding-left: 20px; /* Aumenta a indentação */
    border-left: 2px dashed #90caf9; /* Borda azul pontilhada para diferenciar */
}

/* Estilo para cada item de sub-observação */
.sub-observation-item {
    font-size: 0.9em;
    color: #455a64; /* Tom de azul-cinza escuro */
    padding: 5px;
    background-color: rgba(232, 245, 253, 0.6); /* Fundo azul ainda mais claro */
    border-radius: 3px;
    margin-bottom: 5px;
}

/* [PRIORIDADE 1] Aplica o 'riscado' apenas no título do sub-alvo resolvido */
.observation-item.sub-target.resolved .sub-target-title {
    text-decoration: line-through;
    text-decoration-thickness: 2px;
}

/* [MELHORIA UX] Reduz o destaque da descrição do sub-alvo resolvido */
.observation-item.sub-target.resolved > p {
    opacity: 0.6;
}
/* ==== FIM: ESTILOS PARA SUB-ALVOS ==== */

/* ==== MODAL STYLES ==== */
.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0, 0, 0, 0.4);
}

.modal-content {
    background-color: #fefefe;
    margin: 15% auto;
    padding: 20px;
    border: 1px solid #888;
    width: 80%;
    max-width: 500px;
    border-radius: 5px;
    position: relative;
    box-shadow: 0 3px 7px rgba(0,0,0,0.2);
}
.modal-content h2 {
     text-align: center;
     margin-top: 0;
     margin-bottom: 15px;
}
.modal-content label {
     display: block;
     margin-top: 10px;
     margin-bottom: 3px;
     font-weight: bold;
     text-align: left;
     margin-left: 0; /* Reset for modal content */
}
.modal-content input[type="date"],
.modal-content input[type="text"], /* Added for manualTargetSearchInput */
.modal-content select /* Added for potential future use */
{
     width: 100%;
     margin-bottom: 15px;
     box-sizing: border-box;
}
.modal-buttons {
     text-align: right;
     margin-top: 20px;
}
.modal-buttons .btn {
     margin-left: 10px;
}
.modal-buttons .modal-action-btn { /* Primary action button (e.g., Generate) */
    background-color: #7a5217; /* Brown */
}
.modal-buttons .modal-action-btn:hover {
    background-color: #5f4012;
}
.modal-buttons .modal-cancel-btn { /* Cancel button */
    background-color: #948484; /* Grey */
}
.modal-buttons .modal-cancel-btn:hover {
     background-color: #756b6b;
}

/* Modal Close Button */
.close-button {
    color: #aaa;
    position: absolute;
    top: 10px;
    right: 15px;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
    line-height: 1;
}
.close-button:hover,
.close-button:focus {
    color: black;
    text-decoration: none;
}

/* Specific Styles for Manual Target Addition Modal */
#manualTargetModal .modal-content {
    max-width: 600px; /* Slightly larger for results */
}

.manual-search-results { /* Results container */
    max-height: 300px; /* Limit height and add scroll */
    overflow-y: auto;
    border: 1px solid #eee;
    padding: 5px;
    background-color: #fdfdfd;
    min-height: 50px; /* Min height for feedback */
}

.manual-search-results p { /* Style for messages (e.g., "Type something...") */
    text-align: center;
    color: #888;
    padding: 15px;
}

.manual-target-item { /* Style for each result item */
    padding: 10px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background-color 0.2s;
}
.manual-target-item:last-child {
    border-bottom: none;
}
.manual-target-item:hover {
    background-color: #f0f0f0;
}
.manual-target-item h4 { /* Target title in result */
    margin: 0 0 3px 0;
    font-size: 1.1em;
    color: #333;
}
.manual-target-item span { /* Details/Category in result */
    font-size: 0.9em;
    color: #666;
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis; /* Add '...' if too long */
}

/* Styles for Category Selection Modal */
#categorySelectionModal .modal-content {
    max-width: 450px;
}

#categorySelectionModal p { /* Style for the instruction text */
    text-align: left;
    margin-bottom: 15px;
}

.category-checkboxes-container {
    max-height: 250px;
    overflow-y: auto;
    border: 1px solid #eee;
    padding: 10px;
    margin-bottom: 15px;
    background-color: #fdfdfd;
    text-align: left;
}

.category-checkbox-item {
    display: block;
    margin-bottom: 8px;
}

.category-checkbox-item input[type="checkbox"] {
    margin-right: 8px;
    vertical-align: middle;
    display: inline-block; /* Override general input styles */
    width: auto;
    margin: 0 8px 0 0; /* Override general input styles */
}

.category-checkbox-item label {
    display: inline; /* Keep label next to checkbox */
    font-weight: normal;
    cursor: pointer;
    vertical-align: middle;
    margin: 0; /* Override general label styles */
    text-align: left; /* Override general label styles */
}


/* ==== PAGINATION STYLES ==== */
.pagination {
     display: flex;
     justify-content: center;
     align-items: center;
     margin-top: 20px;
     padding: 10px 0;
}
.page-link {
    display: inline-block;
    padding: 8px 12px;
    margin: 0 3px;
    border: 1px solid #ddd;
    background-color: #f9f9f9;
    color: #333;
    text-decoration: none;
    border-radius: 4px;
    transition: background-color 0.3s;
}
.page-link:hover {
    background-color: #eee;
}
.page-link.disabled { /* Style for disabled pagination links */
     color: #ccc;
     pointer-events: none;
     background-color: #fdfdfd;
}
.pagination span { /* Style for "Page X of Y" text */
     margin: 0 10px;
     color: #666;
}

/* ==== Botão 'Orei!' Unificado ==== */
.pray-button {
    background-color: #9cbe4a; /* Verde */
    color: white;
    border: none;
    padding: 12px 24px;
    font-size: 18px;
    margin: 0;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s, opacity 0.2s;
    vertical-align: middle;
    min-width: 120px;
    text-align: center;
}
.pray-button:hover:not(:disabled) {
    background-color: #85a739;
}
.pray-button:disabled, .pray-button.prayed {
    background-color: #777;
    cursor: not-allowed;
    opacity: 0.8;
}

/* ==== COMPLETION POPUP STYLES ==== */
.popup {
    display: none;
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1010;
    background-color: white;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    border-radius: 5px;
    text-align: center;
    padding: 25px;
    width: 90%;
    max-width: 350px;
    align-items: center;
    justify-content: center;
}

.popup-content {}

.popup h3 {
    margin-top: 0;
    color: #4CAF50; /* Green */
}
.popup p {
    margin-bottom: 10px;
}
.popup-verse {
    font-style: italic;
    margin-top: 15px;
    color: #555;
    border-top: 1px dashed #eee;
    padding-top: 10px;
}

/* ==== VERSES STYLES ==== */
.daily-verses {
    text-align: center;
    margin-bottom: 20px;
    font-style: italic;
    color: #555;
    padding: 10px 15px;
    background-color: #fdfaf6; /* Light cream background */
    border-left: 3px solid #e29420; /* Orange left border */
    border-radius: 3px;
}

/* ==== DEADLINE TAG STYLES ==== */
.deadline-tag {
    background-color: #ffcc00; /* Yellow */
    color: #333;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    display: inline-block;
    border: 1px solid #e6b800;
    vertical-align: middle;
}
.deadline-tag.expired {
    background-color: #ff6666; /* Red */
    color: #fff;
    border-color: #ff4d4d;
}

/* ==== CATEGORY TAG STYLES ==== */
.category-tag {
    background-color: #C71585; /* MediumVioletRed / Fuchsia */
    color: #fff;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    font-weight: bold;
    display: inline-block;
    border: 1px solid #A01069;
    vertical-align: middle;
}

/* ==== CREATION DATE TAG STYLES ==== */
.creation-date-tag {
    background-color: #A5D6A7; /* Verde suave */
    color: #1B5E20; /* Verde escuro */
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    display: inline-block;
    border: 1px solid #66BB6A;
    vertical-align: middle;
}

/* ==== FILTER CONTROL STYLES ==== */
.filter-controls {
     display: flex;
     justify-content: center;
     gap: 15px;
     margin-bottom: 15px;
     flex-wrap: wrap;
}
.filter-container {
    display: flex;
    align-items: center;
}
.filter-container input[type="checkbox"] {
    margin-right: 5px;
    width: auto;
    vertical-align: middle;
}
.filter-container label {
    margin: 0;
    font-weight: normal;
    display: inline;
    text-align: left;
    cursor: pointer;
}

/* ==== AUTH SECTION STYLES ==== */
.auth-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 20px;
    text-align: center;
    padding: 15px;
    background-color: #fff;
    border: 1px solid #eee;
    border-radius: 8px;
    max-width: 450px;
    margin-left: auto;
    margin-right: auto;
}
/* Adicionado para ocultar a seção de autenticação após o login - MELHORIA PRIORIDADE 1 */
.auth-section.hidden {
    display: none;
}
.auth-section .auth-form {
     width: 100%;
}
.auth-section input[type="email"],
.auth-section input[type="password"] {
    margin: 8px 0;
    width: 100%;
    max-width: none;
    box-sizing: border-box;
}
.auth-buttons {
    display: flex;
    gap: 10px;
    margin-top: 15px;
    justify-content: center;
}
.auth-btn {
    padding: 10px 15px;
    border: none;
    border-radius: 5px;
    background-color: #f9c784; /* Light orange */
    color: #333;
    cursor: pointer;
    transition: background-color 0.3s;
    font-size: 1em;
}
.auth-btn:hover { background-color: #f2b366; }

.forgot-password-container { margin-top: 15px; }
.forgot-password-btn {
    background: none; border: none; color: #654321; /* Dark Brown */
    cursor: pointer; text-decoration: underline; font-size: 0.9em;
}
.forgot-password-btn:hover { text-decoration: none; }

.auth-status-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    margin-top: 15px;
    gap: 15px;
    flex-wrap: wrap;
}
.auth-status {
     font-size: 1em;
     margin: 0;
     color: #333;
}
.auth-status-container #btnLogout {
     margin: 0;
     background-color: #a65b5b; /* Muted red */
     color: #fff;
}
.auth-status-container #btnLogout:hover {
     background-color: #914d4d;
}
.password-reset-message {
     padding: 8px;
     margin-top: 10px;
     border-radius: 4px;
     font-size: 0.9em;
     text-align: center;
     width: 100%;
     box-sizing: border-box;
}

/* ==== PERSEVERANCE PROGRESS BAR STYLES ==== */
.perseverance-header h2 {
    font-size: 1.4em;
    margin-bottom: 10px;
    color: #4a3b30;
}

.milestone-icons-area {
    text-align: center;
    margin-bottom: 15px;
    min-height: 44px; /* Evita "pulos" de layout ao carregar */
}

.milestone-icon, .record-crown {
    font-size: 2.8em;
    margin: 0 10px;
    vertical-align: middle;
    transition: opacity 0.4s ease, transform 0.4s ease, color 0.4s ease;
    display: inline-block; /* Ícones são sempre inline-block */
    animation: fadeInScale 0.5s ease-out forwards; /* Animação de entrada */
}

.record-crown {
    color: #ffbf00;
    filter: drop-shadow(0 0 2px rgba(0,0,0,0.6));
}

.record-crown.achieved {
    transform: scale(1.1);
}

.perseverance-bar-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 10px;
    position: relative;
}

.progress-bar { 
    background-color: #e9e0d2;
    border-radius: 12px;
    height: 24px; 
    position: relative;
    display: flex;
    align-items: center;
    flex-grow: 1;
    width: 100%;
    overflow: hidden;
    border: 1px solid #dcd3c5;
    box-sizing: border-box;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.progress { 
    background: linear-gradient(135deg, #FFC107, #FF9800); 
    border-radius: 10px; 
    height: 100%;
    width: 0%; 
    transition: width 0.6s cubic-bezier(0.65, 0, 0.35, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    position: relative;
    overflow: hidden; 
}

.progress-shine-overlay {
    position: absolute;
    top: 0;
    left: 0; 
    width: 100%;
    height: 100%;
    background: linear-gradient( to right, transparent 0%, rgba(255, 255, 255, 0.4) 30%, rgba(255, 255, 255, 0.6) 50%, rgba(255, 255, 255, 0.4) 70%, transparent 100% );
    animation: shineEffect 2.5s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
    animation-delay: 0.5s; 
    opacity: 0; 
    border-radius: inherit; 
}

.progress[style*="width: 0%"] .progress-shine-overlay, 
.progress[style="width:0%;"] .progress-shine-overlay { 
    display: none;
}
.progress:not([style*="width: 0%"]):not([style="width:0%;"]) .progress-shine-overlay {
    opacity: 1; 
}


@keyframes shineEffect {
    0% { transform: translateX(-100%) skewX(-20deg); }
    30% { transform: translateX(100%) skewX(-20deg); }
    100% { transform: translateX(100%) skewX(-20deg); }
}


.progress-percentage-left { 
    padding: 0 12px;
    font-family: 'Playfair Display', serif;
    font-size: 0.9em;
    font-weight: 700;
    color: #424242; 
    white-space: nowrap;
    z-index: 1; 
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    text-shadow: 0 0 3px rgba(255, 255, 240, 0.9), 0 0 5px rgba(255, 255, 240, 0.7);
    line-height: 1;
}

@keyframes pulseGoldNewRecord {
    0%, 100% { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 5px 2px rgba(255, 215, 0, 0.7), inset 0 0 4px rgba(255, 223, 102, 0.5); }
    50% { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 15px 7px rgba(255, 215, 0, 1), inset 0 0 8px rgba(255, 223, 102, 0.8); }
}

.progress.new-record-animation {
    animation: pulseGoldNewRecord 1s ease-in-out 2; 
}

.milestone-legend {
    text-align: center;
    font-size: 0.85em;
    color: #756555; 
    margin-top: 12px;
    font-style: italic;
}
.milestone-legend span {
    margin: 0 7px;
}

/* NOVOS ESTILOS PARA MARCOS CUMULATIVOS */
.milestone-group {
    display: inline-flex; /* Alinha ícone e contador na mesma linha */
    align-items: center;  /* Centraliza verticalmente */
    margin: 0 5px;      /* Espaçamento entre os grupos de marcos */
}

.milestone-counter {
    font-size: 1.2em;
    font-weight: bold;
    color: #6D4C41; /* Tom de marrom para combinar com a identidade */
    margin-left: -5px; /* Leve sobreposição para um visual mais coeso */
    align-self: flex-end; /* Alinha na base do ícone */
    padding-bottom: 5px;
    text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.7);
}

@keyframes fadeInScale {
    from {
        opacity: 0;
        transform: scale(0.5);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}
/* FIM DOS NOVOS ESTILOS */


/* ==== WEEKLY PERSEVERANCE CHART STYLES ==== */
.weekly-header h3 {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 1.2em;
    color: #555;
}

.days-container {
    display: flex;
    justify-content: space-around;
    align-items: center;
}

.day {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px;
    transition: all 0.3s ease; 
}

.day.current-day-container {
    border: 2px solid #9cbe4a; 
    border-radius: 8px;        
    background-color: rgba(156, 190, 74, 0.08); 
    padding: 3px 5px;          
    margin: -5px 0;            
}

.day-name {
    font-size: 0.85em;
    color: #777;
    margin-bottom: 4px;
    font-weight: bold;
}

.day-tick {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #ccc;
    text-align: center;
    font-size: 1em;
    color: #fff;
    background-color: #e0e0e0;
    transition: background-color 0.3s, border-color 0.3s, color 0.3s;
    position: relative;
}

.day-tick.active {
    background-color: #f9a825;
    border-color: #f9a825;
}
.day-tick.active::before {
    content: '✓';
    font-weight: bold;
}

.day-tick.inactive {
    background-color: #ffebee;
    border-color: #ef9a9a;
}
.day-tick.inactive::before {
    content: '×';
    font-weight: normal;
    font-size: 1.1em;
    color: #f44336;
}

/* ==== COMPLETED DAILY TARGETS STYLES ==== */
.completed-target { 
    background-color: #f0f0f0 !important; 
    color: #777;
    border-left: 3px solid #9cbe4a; 
    margin-bottom: 8px;
    padding-left: 10px;
    border-radius: 3px;
    opacity: 0.8; 
}
.completed-target h3, .completed-target p {
    color: #777 !important; 
}

/* ==== ANIMAÇÕES E EFEITOS DE UX (PRIORIDADE 2.b) ==== */
@keyframes fadeInItem {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.fade-in-item {
    animation: fadeInItem 0.5s ease-out forwards;
}

/* ==== INÍCIO: NOVOS ESTILOS PARA EDIÇÃO INLINE ==== */
/* Estilo para o ícone de edição (lápis) */
.edit-icon {
    display: inline-block;
    margin-left: 8px;
    cursor: pointer;
    font-size: 0.8em;
    opacity: 0.5; /* Começa discreto */
    transition: opacity 0.2s;
    vertical-align: middle; /* Alinha com o texto */
}

/* O ícone fica mais visível ao passar o mouse */
.target h3:hover .edit-icon,
.target-details:hover .edit-icon,
.observation-item:hover .edit-icon {
    opacity: 1;
}

/* Container para os formulários de edição inline */
.inline-edit-form {
    margin-top: 10px;
    padding: 10px;
    background-color: #fff9e7; /* Amarelo bem claro para destaque */
    border: 1px solid #ffe082;
    border-radius: 5px;
    animation: fadeInItem 0.4s ease-out;
}

.inline-edit-form input[type="text"],
.inline-edit-form input[type="date"],
.inline-edit-form textarea {
    width: 100%;
    box-sizing: border-box; /* Garante que padding não estoure a largura */
    padding: 8px;
    margin-bottom: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: 'Playfair Display', serif;
}

.inline-edit-form .form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end; /* Alinha botões à direita */
    align-items: center;
}

.inline-edit-form .btn-small {
    padding: 5px 12px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    border: none;
    color: white;
}

.inline-edit-form .save-btn { background-color: #28a745; } /* Verde */
.inline-edit-form .cancel-btn { background-color: #dc3545; } /* Vermelho */
.inline-edit-form .remove-btn { background-color: #e57373; color: white; } /* Vermelho suave */

.inline-edit-form label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
    text-align: left;
    color: #5d4037;
    font-size: 0.9em;
}
/* ==== FIM: NOVOS ESTILOS PARA EDIÇÃO INLINE ==== */


/* ==== RESPONSIVENESS ==== */
@media (max-width: 768px) {
    body { font-size: 15px; padding: 5px; }
    h1 { font-size: 2em; }
    h2 { font-size: 1.4em; }
    h3 { font-size: 1.1em; }

    .main-menu { margin-bottom: 15px; }
    .main-menu .btn { font-size: 13px; padding: 8px 15px; margin: 3px; }

    .form-section, .targets-section, .daily-section, .perseverance-section, .weekly-perseverance-chart, .auth-section, .completed-daily-targets-section, .priority-section {
         width: 98%;
         padding: 12px;
         margin: 10px auto;
    }

    input[type="text"], input[type="email"], input[type="password"], input[type="date"], textarea, select, .search-input {
        width: 95%;
        padding: 10px;
        max-width: none; 
    }
    .modal-content input[type="date"], 
    .modal-content input[type="text"],
    .modal-content select {
        width: 100%; 
        max-width: none;
    }

    .target { padding: 10px 5px; }
    .target-actions { gap: 3px; }
    .target .btn { font-size: 12px; padding: 5px 8px; }

    .daily-buttons-container { flex-direction: column; gap: 5px; } 
    .daily-buttons-container .btn { width: 80%; margin: 3px auto; }

    .pagination { flex-direction: column; gap: 5px; }
    .page-link { padding: 6px 10px; font-size: 0.85em; }

    .modal-content { width: 95%; margin: 20% auto; padding: 15px;}

    /* Perseverance bar responsiveness */
    .milestone-icon, .record-crown { font-size: 2.2em; margin: 0 8px; }
    .progress-bar { height: 22px; }
    .progress-percentage-left { font-size: 0.8em; }
    .milestone-legend { font-size: 0.8em; }


    .days-container { justify-content: space-between; }
    .day-name { font-size: 0.75em; }
    .day-tick { width: 18px; height: 18px; border-width: 1px; font-size: 0.9em; }
}

@media (max-width: 480px) {
     h1 { font-size: 1.8em; }
     h2 { font-size: 1.3em; }
     .main-menu .btn { font-size: 12px; padding: 7px 12px; }
     .auth-section { max-width: 95%; }
     .auth-btn { font-size: 0.9em; padding: 8px 12px; }
     .modal-content { margin: 25% auto; } 
     
     /* Perseverance bar responsiveness for very small screens */
     .milestone-icon, .record-crown { font-size: 1.8em; margin: 0 5px; }
     .progress-bar { height: 20px; }
     .progress-percentage-left { font-size: 0.75em; padding: 0 8px; }
     .milestone-legend { font-size: 0.75em; }
     .milestone-legend span { margin: 0 4px; }


     .target .btn { font-size: 11px; padding: 4px 6px; }
     .deadline-tag, .category-tag, .resolved-tag, .creation-date-tag { font-size: 0.75em; padding: 2px 5px; margin-right: 4px;}
     .target h3 { gap: 3px; }

     .category-checkboxes-container { max-height: 200px;}
     .category-checkbox-item label { font-size: 0.95em; }
}

/* ==== NAVEGADOR FLUTUANTE ==== */
.floating-nav {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(5px);
    padding: 10px 12px;
    border-radius: 40px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 950;
    display: flex;
    gap: 12px;
    transition: opacity 0.4s ease, visibility 0.4s ease, transform 0.4s ease;
    opacity: 1;
    visibility: visible;
}

.floating-nav.hidden {
    opacity: 0;
    visibility: hidden;
    transform: translateX(-50%) translateY(calc(100% + 25px));
}

.floating-nav .nav-btn {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 58px;
    height: 58px;
    border: none;
    border-radius: 50%;
    text-decoration: none;
    color: white;
    font-size: 1.8rem;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.floating-nav .nav-btn:hover {
    transform: scale(1.1);
}

.floating-nav .nav-btn:active {
    transform: scale(0.95);
}

/* Cores específicas para cada botão */
.floating-nav .top-btn {
    background-color: #7f8c8d; /* Cinza */
    order: 1;
}
.floating-nav .priority-btn {
    background-color: #2c3e50; /* Preto/Azul escuro */
    order: 2;
}
.floating-nav .daily-btn {
    background-color: #3498db; /* Azul Céu */
    order: 3;
}
.floating-nav .up-btn {
    background-color: #95a5a6; /* Cinza suave */
    order: 4;
}
.floating-nav .down-btn {
    background-color: #95a5a6; /* Cinza suave */
    order: 5;
}

/* Estilo para os ícones SVG dentro dos botões */
.floating-nav .nav-btn svg {
    width: 28px;
    height: 28px;
    stroke: white;
    stroke-width: 2.5;
}

@media (max-width: 480px) {
    .floating-nav {
        gap: 8px;
        padding: 8px 10px;
    }
    .floating-nav .nav-btn {
        width: 50px;
        height: 50px;
        font-size: 1.6rem;
    }
    .floating-nav .nav-btn svg {
        width: 24px;
        height: 24px;
    }
}


/* ==== TOAST NOTIFICATION (Prazos Vencidos) ==== */
.toast-notification {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #e44d26; /* Cor de alerta */
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
    z-index: 1050;
    display: flex;
    align-items: center;
    gap: 15px;
    opacity: 1;
    transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
    visibility: visible;
}

.toast-notification.hidden {
    opacity: 0;
    visibility: hidden;
    transform: translateX(-50%) translateY(calc(100% + 20px));
}

.toast-notification .toast-close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.8;
    padding: 0 5px;
}

.toast-notification .toast-close-btn:hover {
    opacity: 1;
}

/* ==== APP TOAST NOTIFICATIONS (Genérico) - MELHORIAS PRIORIDADE 2 e 3 ==== */
.app-toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 5px;
    color: white;
    z-index: 1051; /* Acima do outro toast */
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.4s, transform 0.4s, visibility 0.4s;
    transform: translateY(20px);
    display: flex;
    align-items: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.app-toast.show {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

/* Variações de Cor */
.app-toast.success { background-color: #28a745; } /* Verde */
.app-toast.error   { background-color: #dc3545; } /* Vermelho */
.app-toast.info    { background-color: #17a2b8; } /* Azul Info */

.app-toast-message {
    flex-grow: 1; /* Permite que a mensagem ocupe o espaço */
}

/* Botão de Fechar para Toasts (Prioridade 3) */
.app-toast .toast-close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.8;
    padding: 0 0 0 15px; /* Espaço entre a mensagem e o botão */
    margin-left: auto; /* Garante alinhamento à direita */
}

.app-toast .toast-close-btn:hover {
    opacity: 1;
}


/* ==== NOVOS ESTILOS (MELHORIA ARQUITETURAL) ==== */
.target-main-action {
    margin-top: 15px;
    margin-bottom: 10px;
    text-align: left;
}

/* Estilo para o botão 'Orei' dentro de um sub-alvo */
.sub-target .pray-button {
    background-color: #6a8d73; /* Um tom de verde distinto mas harmonioso */
    color: white;
    padding: 6px 14px;
    font-size: 14px;
    border-radius: 5px;
    margin-right: 8px; /* Espaçamento para outros botões */
}

.sub-target .pray-button:hover:not(:disabled) {
    background-color: #587962;
}

/* Estilo para botões pequenos desabilitados, como o de 'Reverter' */
.observation-actions .btn-small:disabled {
    background-color: #e0e0e0;
    border-color: #bdbdbe;
    color: #9e9e9e;
    cursor: not-allowed;
    opacity: 0.7;
}

/* (Opcional) Adiciona um 'tooltip' nativo para o botão desabilitado */
.observation-actions .btn-small:disabled:hover::after {
    content: attr(title); /* Exibe o conteúdo do atributo 'title' */
    position: absolute;
    background-color: #333;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    transform: translateY(-120%);
}
