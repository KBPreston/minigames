import { Ball, Brick, BrickType, BallType, Vec2, MINI_BALL_RADIUS, BALL_SPEED } from './types';

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Ball accelerates slightly on each bounce, capped at max speed
const BOUNCE_ACCELERATION = 1.03; // 3% faster per bounce
const MAX_SPEED = BALL_SPEED * 2.5; // Cap at 2.5x starting speed

export interface CollisionResult {
  hit: boolean;
  brick?: Brick;
  normal?: Vec2;
}

// Reflect velocity off a surface normal
function reflect(velocity: Vec2, normal: Vec2): Vec2 {
  const dot = velocity.x * normal.x + velocity.y * normal.y;
  return {
    x: velocity.x - 2 * dot * normal.x,
    y: velocity.y - 2 * dot * normal.y,
  };
}

// Add slight randomness to prevent infinite loops
function addJitter(velocity: Vec2, amount: number = 0.05): Vec2 {
  const angle = (Math.random() - 0.5) * amount;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: velocity.x * cos - velocity.y * sin,
    y: velocity.x * sin + velocity.y * cos,
  };
}

// Accelerate ball on bounce, capped at max speed
function accelerate(velocity: Vec2): Vec2 {
  const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
  const newSpeed = Math.min(currentSpeed * BOUNCE_ACCELERATION, MAX_SPEED);
  const scale = newSpeed / currentSpeed;
  return {
    x: velocity.x * scale,
    y: velocity.y * scale,
  };
}

// Check if ball collides with a brick, return collision info
export function checkBrickCollision(ball: Ball, brick: Brick): CollisionResult {
  // Find closest point on brick to ball center
  const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
  const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));

  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < ball.radius * ball.radius) {
    // Determine collision normal
    let normal: Vec2;

    // Check which side we hit
    const overlapLeft = (ball.x + ball.radius) - brick.x;
    const overlapRight = (brick.x + brick.width) - (ball.x - ball.radius);
    const overlapTop = (ball.y + ball.radius) - brick.y;
    const overlapBottom = (brick.y + brick.height) - (ball.y - ball.radius);

    const minOverlapX = Math.min(overlapLeft, overlapRight);
    const minOverlapY = Math.min(overlapTop, overlapBottom);

    if (minOverlapX < minOverlapY) {
      normal = overlapLeft < overlapRight ? { x: -1, y: 0 } : { x: 1, y: 0 };
    } else {
      normal = overlapTop < overlapBottom ? { x: 0, y: -1 } : { x: 0, y: 1 };
    }

    return { hit: true, brick, normal };
  }

  return { hit: false };
}

// Update ball position and handle wall collisions
export function updateBall(
  ball: Ball,
  dt: number,
  bounds: Bounds,
  bricks: Brick[]
): { destroyed: Brick | null; exited: boolean } {
  if (!ball.active) return { destroyed: null, exited: false };

  // Move ball
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  let destroyed: Brick | null = null;

  // Wall collisions - accelerate on each bounce
  if (ball.x - ball.radius < bounds.left) {
    ball.x = bounds.left + ball.radius;
    ball.vx = Math.abs(ball.vx);
    const vel = accelerate(addJitter({ x: ball.vx, y: ball.vy }));
    ball.vx = vel.x;
    ball.vy = vel.y;
  }
  if (ball.x + ball.radius > bounds.right) {
    ball.x = bounds.right - ball.radius;
    ball.vx = -Math.abs(ball.vx);
    const vel = accelerate(addJitter({ x: ball.vx, y: ball.vy }));
    ball.vx = vel.x;
    ball.vy = vel.y;
  }
  if (ball.y - ball.radius < bounds.top) {
    ball.y = bounds.top + ball.radius;
    ball.vy = Math.abs(ball.vy);
    const vel = accelerate(addJitter({ x: ball.vx, y: ball.vy }));
    ball.vx = vel.x;
    ball.vy = vel.y;
  }

  // Check bottom exit
  if (ball.y - ball.radius > bounds.bottom) {
    ball.active = false;
    return { destroyed: null, exited: true };
  }

  // Brick collisions - accelerate on each bounce
  for (const brick of bricks) {
    const result = checkBrickCollision(ball, brick);
    if (result.hit && result.normal) {
      // Reflect velocity and accelerate
      const reflected = reflect({ x: ball.vx, y: ball.vy }, result.normal);
      const accelerated = accelerate(addJitter(reflected));
      ball.vx = accelerated.x;
      ball.vy = accelerated.y;

      // Push ball out of brick
      ball.x += result.normal.x * (ball.radius + 1);
      ball.y += result.normal.y * (ball.radius + 1);

      // Damage brick if destructible
      if (brick.type !== BrickType.Indestructible) {
        brick.hp--;
        if (brick.hp <= 0) {
          destroyed = brick;
        }
      }

      break; // Only handle one collision per frame
    }
  }

  return { destroyed, exited: false };
}

// Create a ball with given direction
export function createBall(
  x: number,
  y: number,
  angle: number,
  speed: number,
  radius: number,
  type: BallType = BallType.Normal,
  isMiniBall: boolean = false
): Ball {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    active: true,
    type,
    isMiniBall,
  };
}

// Create triple shot balls (3 balls in a fork pattern)
export function createTripleShotBalls(
  x: number,
  y: number,
  angle: number,
  speed: number
): Ball[] {
  const spreadAngle = Math.PI / 12; // 15 degrees spread
  return [
    createBall(x, y, angle - spreadAngle, speed, MINI_BALL_RADIUS, BallType.TripleShot, true),
    createBall(x, y, angle, speed, MINI_BALL_RADIUS, BallType.TripleShot, true),
    createBall(x, y, angle + spreadAngle, speed, MINI_BALL_RADIUS, BallType.TripleShot, true),
  ];
}

// Calculate launch angle from drag
export function calculateLaunchAngle(startX: number, startY: number, endX: number, endY: number): number {
  // Direction from start to end (player drags opposite to launch direction)
  const dx = startX - endX;
  const dy = startY - endY;

  // Clamp to upward angles only (between -150 and -30 degrees, in radians)
  let angle = Math.atan2(dy, dx);

  // Ensure ball goes upward
  if (angle > 0) angle = -Math.PI + angle;
  if (angle > -Math.PI * 0.15) angle = -Math.PI * 0.15;
  if (angle < -Math.PI * 0.85) angle = -Math.PI * 0.85;

  return angle;
}

// Trajectory point for prediction line
export interface TrajectoryPoint {
  x: number;
  y: number;
  bounce: boolean; // True if this point is a bounce location
}

// Calculate predicted trajectory with bounces
export function calculateTrajectory(
  startX: number,
  startY: number,
  angle: number,
  speed: number,
  radius: number,
  bounds: Bounds,
  bricks: Brick[],
  maxBounces: number = 3,
  maxDistance: number = 800
): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [{ x: startX, y: startY, bounce: false }];

  let x = startX;
  let y = startY;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  let bounces = 0;
  let distance = 0;
  const step = 2; // Simulation step size in pixels

  while (bounces < maxBounces && distance < maxDistance) {
    // Normalize and step
    const mag = Math.sqrt(vx * vx + vy * vy);
    const dx = (vx / mag) * step;
    const dy = (vy / mag) * step;

    x += dx;
    y += dy;
    distance += step;

    let bounced = false;

    // Wall collisions
    if (x - radius < bounds.left) {
      x = bounds.left + radius;
      vx = Math.abs(vx);
      bounced = true;
    }
    if (x + radius > bounds.right) {
      x = bounds.right - radius;
      vx = -Math.abs(vx);
      bounced = true;
    }
    if (y - radius < bounds.top) {
      y = bounds.top + radius;
      vy = Math.abs(vy);
      bounced = true;
    }

    // Check brick collisions (simplified - just check bounding box)
    for (const brick of bricks) {
      if (brick.hp <= 0) continue;

      const closestX = Math.max(brick.x, Math.min(x, brick.x + brick.width));
      const closestY = Math.max(brick.y, Math.min(y, brick.y + brick.height));
      const distX = x - closestX;
      const distY = y - closestY;
      const distSq = distX * distX + distY * distY;

      if (distSq < radius * radius) {
        // Hit a brick - determine which side
        const overlapLeft = (x + radius) - brick.x;
        const overlapRight = (brick.x + brick.width) - (x - radius);
        const overlapTop = (y + radius) - brick.y;
        const overlapBottom = (brick.y + brick.height) - (y - radius);

        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);

        if (minOverlapX < minOverlapY) {
          vx = -vx;
          x += overlapLeft < overlapRight ? -radius : radius;
        } else {
          vy = -vy;
          y += overlapTop < overlapBottom ? -radius : radius;
        }

        bounced = true;
        break;
      }
    }

    if (bounced) {
      points.push({ x, y, bounce: true });
      bounces++;
    }

    // Stop if going below play area
    if (y > bounds.bottom) {
      break;
    }
  }

  // Add final point
  if (points.length > 0) {
    const last = points[points.length - 1];
    if (last.x !== x || last.y !== y) {
      points.push({ x, y, bounce: false });
    }
  }

  return points;
}
