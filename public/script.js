document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const htmlElement = document.documentElement;

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    htmlElement.setAttribute('data-theme', savedTheme);
    updateThemeIcons(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcons(newTheme);
        updateChartTheme(newTheme);
    });

    function updateThemeIcons(theme) {
        if (theme === 'dark') {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        } else {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    }

    // Chart.js Setup
    const ctx = document.getElementById('priceChart').getContext('2d');
    let priceChart;

    function getChartThemeOptions(theme) {
        const textColor = theme === 'dark' ? '#cbd5e1' : '#4b5563';
        const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        
        return {
            color: textColor,
            gridColor: gridColor
        };
    }

    function initChart(historyData) {
        const theme = htmlElement.getAttribute('data-theme');
        const themeOpts = getChartThemeOptions(theme);
        
        const labels = historyData.map(d => d.time);
        const data = historyData.map(d => d.price);

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gold Price (₹)',
                    data: data,
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fbbf24',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { color: themeOpts.gridColor, drawBorder: false },
                        ticks: { color: themeOpts.color, maxTicksLimit: 5 }
                    },
                    y: {
                        grid: { color: themeOpts.gridColor, drawBorder: false },
                        ticks: { color: themeOpts.color }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    function updateChartTheme(theme) {
        if (!priceChart) return;
        const themeOpts = getChartThemeOptions(theme);
        priceChart.options.scales.x.grid.color = themeOpts.gridColor;
        priceChart.options.scales.y.grid.color = themeOpts.gridColor;
        priceChart.options.scales.x.ticks.color = themeOpts.color;
        priceChart.options.scales.y.ticks.color = themeOpts.color;
        priceChart.update();
    }

    // Fetch Price History
    let lastPrice = null;
    async function fetchPricing() {
        try {
            const response = await fetch('/api/history');
            const history = await response.json();
            
            if (history && history.length > 0) {
                const currentData = history[history.length - 1];
                const currentPriceEl = document.getElementById('currentPrice');
                
                // Format price with comma
                currentPriceEl.textContent = `₹ ${currentData.price.toLocaleString('en-IN')}`;
                
                // Add color indicator if price went down/up
                if (lastPrice !== null) {
                    currentPriceEl.classList.remove('up', 'down');
                    if (currentData.price > lastPrice) {
                        currentPriceEl.classList.add('up');
                    } else if (currentData.price < lastPrice) {
                        currentPriceEl.classList.add('down');
                    }
                }
                lastPrice = currentData.price;

                if (!priceChart) {
                    initChart(history);
                } else {
                    priceChart.data.labels = history.map(d => d.time);
                    priceChart.data.datasets[0].data = history.map(d => d.price);
                    priceChart.update();
                }
            }
        } catch (error) {
            console.error('Error fetching price history:', error);
        }
    }

    fetchPricing();
    // Update every 60 seconds
    setInterval(fetchPricing, 60000);

    // Form Submission Logic
    const alertForm = document.getElementById('alertForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const formMessage = document.getElementById('formMessage');

    alertForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const targetPrice = document.getElementById('targetPrice').value.trim();

        if (!email || !targetPrice) return;

        // UI Loading State
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        submitBtn.disabled = true;
        formMessage.textContent = '';
        formMessage.className = 'message';

        try {
            const response = await fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, targetPrice: Number(targetPrice) })
            });
            
            const data = await response.json();

            if (response.ok) {
                formMessage.textContent = 'Alert set successfully! You will be notified.';
                formMessage.classList.add('success');
                alertForm.reset();
            } else {
                formMessage.textContent = data.error || 'Failed to set alert.';
                formMessage.classList.add('error');
            }
        } catch (error) {
            formMessage.textContent = 'An error occurred. Please try again.';
            formMessage.classList.add('error');
        } finally {
            // Restore UI
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            submitBtn.disabled = false;

            // Clear success message after 5 seconds
            setTimeout(() => {
                if (formMessage.classList.contains('success')) {
                    formMessage.textContent = '';
                    formMessage.className = 'message';
                }
            }, 5000);
        }
    });
});
