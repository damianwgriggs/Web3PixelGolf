(function() {
    // --- Setup ---
    let canvas;
    let ctx;

    // --- Physics & Game Constants ---
    const GRAVITY = 0.5; // A bit softer for a pixel game
    const FRICTION = 0.90; // Ground friction (velocity decay)
    const BOUNCE = -0.5; // Energy loss on wall/obstacle bounce
    const GROUND_HEIGHT = 20; // Pixel height of the green ground
    const MAX_HOLES = 5;

    // --- Game Objects ---
    let ball = {
        x: 0,
        y: 0,
        radius: 5,
        vx: 0,
        vy: 0
    };

    let hole = {
        x: 0,
        y: 0,
        radius: 8
    };

    let obstacles = []; // Array of {x, y, width, height}

    // --- Game State ---
    let gameState = {
        currentHole: 1,
        totalScore: 0,
        currentStrokes: 0,
        isBallMoving: false
    };

    /**
     * Public API exposed to index.html
     */
    const pixelGolf = {
        /**
         * Initializes the game engine. Called by index.html.
         * @param {HTMLCanvasElement} canvasElement - The canvas element from the DOM.
         */
        init: (canvasElement) => {
            canvas = canvasElement;
            ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false; // Ensures pixelated look

            // Reset game state
            gameState.currentHole = 1;
            gameState.totalScore = 0;
            
            startNewHole();
            gameLoop(); // Start the main loop
        },

        /**
         * Launches the ball. Called by the "LAUNCH" button in index.html.
         * @param {number} power - The power value (0-100) from the slider.
         * @param {number} angle - The angle value (0-90) from the slider.
         */
        launch: (power, angle) => {
            if (gameState.isBallMoving) return;

            gameState.isBallMoving = true;
            gameState.currentStrokes++;
            window.gameInterface.updateScoreboard(
                gameState.currentHole,
                gameState.currentStrokes,
                gameState.totalScore
            );

            // Convert power/angle to velocity
            // 1. Scale power to a reasonable velocity (e.g., 0-100 -> 0-15)
            const velocity = power * 0.15;
            // 2. Convert degrees to radians
            const radians = angle * (Math.PI / 180);
            
            // 3. Calculate vx and vy
            ball.vx = velocity * Math.cos(radians);
            // 4. Invert vy because canvas Y-axis is inverted (0 is at the top)
            ball.vy = -velocity * Math.sin(radians);
        }
    };

    /**
     * Sets up the course for a new hole.
     */
    function startNewHole() {
        // Reset ball state
        ball.vx = 0;
        ball.vy = 0;
        ball.x = 50; // Start on the left
        ball.y = canvas.height - GROUND_HEIGHT - ball.radius; // Rest on the ground
        
        // Reset stroke count
        gameState.currentStrokes = 0;
        gameState.isBallMoving = false;

        // Generate a random hole location on the right 2/3rds of the screen
        hole.x = Math.random() * (canvas.width * 0.66) + (canvas.width * 0.33);
        hole.y = canvas.height - (GROUND_HEIGHT / 2); // Center of the hole in the ground
        
        // Generate random obstacles
        obstacles = [];
        const numObstacles = Math.floor(Math.random() * 3) + 1; // 1 to 3 obstacles
        for (let i = 0; i < numObstacles; i++) {
            const obsWidth = Math.random() * 30 + 10; // 10-40px wide
            const obsHeight = Math.random() * 80 + 20; // 20-100px high
            const obsX = Math.random() * (hole.x - 150 - ball.x) + ball.x + 100; // Place between ball and hole
            const obsY = canvas.height - GROUND_HEIGHT - obsHeight; // Sit on the ground
            
            obstacles.push({ x: obsX, y: obsY, width: obsWidth, height: obsHeight });
        }

        // Update the scoreboard UI
        window.gameInterface.updateScoreboard(
            gameState.currentHole,
            gameState.currentStrokes,
            gameState.totalScore
        );
        // Re-enable the controls
        window.gameInterface.endTurn();
    }

    /**
     * The main game loop, called by requestAnimationFrame.
     */
    function gameLoop() {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }

    /**
     * Updates all game physics and state.
     */
    function update() {
        if (!gameState.isBallMoving) return;

        // --- Physics ---
        // 1. Apply Gravity (only if not on the ground)
        if (ball.y + ball.radius < canvas.height - GROUND_HEIGHT || ball.vy < 0) {
             ball.vy += GRAVITY;
        }

        // 2. Update Position
        ball.x += ball.vx;
        ball.y += ball.vy;

        // --- Collision Detection ---
        handleCollisions();

        // --- Check Win Condition ---
        const distToHole = Math.hypot(ball.x - hole.x, ball.y - hole.y);
        // Ball must be on the ground and slow
        const isOnGround = ball.y + ball.radius >= canvas.height - GROUND_HEIGHT;
        const isSlowEnough = Math.abs(ball.vx) < 1.5;

        if (isOnGround && distToHole < hole.radius && isSlowEnough) {
            // --- HOLE IN! ---
            gameState.isBallMoving = false;
            ball.vx = 0;
            ball.vy = 0;

            gameState.totalScore += gameState.currentStrokes;
            gameState.currentHole++;

            if (gameState.currentHole > MAX_HOLES) {
                // --- END OF COURSE ---
                window.gameInterface.endCourse(gameState.totalScore);
            } else {
                // --- NEXT HOLE ---
                startNewHole();
            }
            return; // Stop update
        }

        // --- Check Stop Condition ---
        // Check if ball is on the ground and moving very slowly
        const stopOnGround = ball.y + ball.radius >= canvas.height - GROUND_HEIGHT;
        
        // Stricter check for vy (it must be 0), but lenient for vx
        const isStopped = Math.abs(ball.vx) < 0.1 && ball.vy === 0;

        if (stopOnGround && isStopped) {
            ball.vx = 0;
            ball.y = canvas.height - GROUND_HEIGHT - ball.radius; // Snap to ground
            gameState.isBallMoving = false;
            
            // Tell index.html to re-enable controls
            window.gameInterface.endTurn();
        }
    }

    /**
     * Handles all collisions for the ball.
     */
    function handleCollisions() {
        // 1. Ground Collision
        if (ball.y + ball.radius > canvas.height - GROUND_HEIGHT) {
            ball.y = canvas.height - GROUND_HEIGHT - ball.radius; // Snap

            // --- THIS IS THE FIX ---
            // If the bounce is very small, just kill vertical velocity to stop jitter
            if (Math.abs(ball.vy) < 1.0) {
                ball.vy = 0;
            } else {
                ball.vy *= BOUNCE; // Bounce
            }
            // --- END FIX ---

            ball.vx *= FRICTION; // Apply ground friction
        }

        // 2. Wall Collisions (Left/Right)
        if (ball.x + ball.radius > canvas.width) {
            ball.x = canvas.width - ball.radius;
            ball.vx *= BOUNCE;
        } else if (ball.x - ball.radius < 0) {
            ball.x = 0 + ball.radius;
            ball.vx *= BOUNCE;
        }

        // 3. Ceiling Collision
        if (ball.y - ball.radius < 0) {
            ball.y = 0 + ball.radius;
            ball.vy *= BOUNCE;
        }

        // 4. Obstacle Collisions
        obstacles.forEach(rect => {
            checkRectCollision(rect);
        });
    }

    /**
     * Checks and resolves AABB collision between the ball and a rectangle.
     * @param {object} rect - The obstacle {x, y, width, height}
     */
    function checkRectCollision(rect) {
        // Find the closest point on the rectangle to the ball's center
        const closestX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.width));
        const closestY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.height));

        // Calculate distance between ball center and closest point
        const distance = Math.hypot(ball.x - closestX, ball.y - closestY);

        // If distance is less than ball's radius, there's a collision
        if (distance < ball.radius) {
            // --- COLLISION DETECTED ---
            
            // Calculate overlap
            const overlap = ball.radius - distance;
            
            // Normalize the vector from closest point to ball center
            let normalX = (ball.x - closestX) / distance;
            let normalY = (ball.y - closestY) / distance;

            // If distance is 0 (ball center is inside rect), create a default normal
            if (distance === 0) {
                normalX = 1;
                normalY = 0;
            }

            // --- Resolve Position ---
            // Push ball out of the rectangle
            ball.x += normalX * overlap;
            ball.y += normalY * overlap;

            // --- Resolve Velocity (Bounce) ---
            // Reflect velocity vector around the normal
            const dot = ball.vx * normalX + ball.vy * normalY;
            ball.vx = (ball.vx - 2 * dot * normalX) * (BOUNCE * -1); // Use positive bounce for reflection
            ball.vy = (ball.vy - 2 * dot * normalY) * (BOUNCE * -1);

            // Special case: If ball hits top of an obstacle, apply friction
            if (closestX > rect.x && closestX < rect.x + rect.width && ball.y < rect.y) {
                 ball.vx *= FRICTION;
            }
        }
    }


    /**
     * Draws the entire game scene to the canvas.
     */
    function draw() {
        // 1. Clear canvas (Sky)
        ctx.fillStyle = '#70c5ce'; // Pixel-friendly sky blue
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Draw Ground
        ctx.fillStyle = '#5fb74a'; // Pixel green
        ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);

        // 3. Draw Hole
        ctx.fillStyle = '#222222'; // Black
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
        ctx.fill();

        // 4. Draw Obstacles
        ctx.fillStyle = '#a0522d'; // Brown
        obstacles.forEach(obs => {
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        });

        // 5. Draw Ball
        ctx.fillStyle = '#ffffff'; // White
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cccccc'; // Light grey outline
        ctx.stroke();
    }

    // --- Expose Public API ---
    window.pixelGolf = pixelGolf;

})();
