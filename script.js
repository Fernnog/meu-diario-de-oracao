document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('prayerForm');
    const targetList = document.getElementById('targetList');
    let targets = JSON.parse(localStorage.getItem('prayerTargets')) || [];

    // Função para salvar alvos no localStorage
    function saveTargets() {
        localStorage.setItem('prayerTargets', JSON.stringify(targets));
    }

    // Função para exibir os alvos
    function displayTargets() {
        targetList.innerHTML = '';
        targets.forEach((target, index) => {
            const targetElement = document.createElement('div');
            targetElement.className = 'target';
            targetElement.innerHTML = `
                <h3>${target.title}</h3>
                <p>${target.details}</p>
                <p>Data: ${new Date(target.date).toLocaleDateString()}</p>
                <button class="delete-btn" onclick="deleteTarget(${index})">Excluir</button>
            `;
            targetList.appendChild(targetElement);
        });
    }

    // Função para deletar um alvo
    window.deleteTarget = function(index) {
        if (confirm('Tem certeza que deseja excluir este alvo?')) {
            targets.splice(index, 1);
            saveTargets();
            displayTargets();
        }
    }

    // Manipular envio do formulário
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newTarget = {
            title: document.getElementById('title').value,
            details: document.getElementById('details').value,
            date: document.getElementById('date').value,
            createdAt: new Date().toISOString()
        };

        targets.push(newTarget);
        saveTargets();
        displayTargets();
        form.reset();
    });

    // Exibir alvos ao carregar a página
    displayTargets();
});
