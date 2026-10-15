from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1600, 900
img = Image.new('RGB', (W, H), '#FFFFFF')
draw = ImageDraw.Draw(img)

try:
    font_title = ImageFont.truetype("arial.ttf", 16)
    font_label = ImageFont.truetype("arial.ttf", 13)
    font_small = ImageFont.truetype("arial.ttf", 11)
    font_arrow = ImageFont.truetype("arial.ttf", 12)
except:
    font_title = ImageFont.load_default()
    font_label = font_title
    font_small = font_title
    font_arrow = font_title

def rounded_rect(x, y, w, h, fill, outline, radius=8):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=radius, fill=fill, outline=outline, width=2)

def draw_box(x, y, w, h, title, lines, fill, outline):
    rounded_rect(x, y, w, h, fill, outline)
    draw.text((x + w//2, y + 8), title, fill='#000000', font=font_title, anchor='mt')
    cy = y + 30
    for line in lines:
        draw.text((x + 10, cy), line, fill='#333333', font=font_small)
        cy += 16

def arrow(x1, y1, x2, y2, label=''):
    draw.line([(x1, y1), (x2, y2)], fill='#333333', width=2)
    angle = 0
    if x2 > x1: angle = 0
    elif x2 < x1: angle = 180
    elif y2 > y1: angle = 90
    else: angle = 270
    import math
    dx, dy = x2-x1, y2-y1
    length = math.sqrt(dx*dx + dy*dy)
    ux, uy = dx/length, dy/length
    px, py = -uy, ux
    head = 10
    draw.polygon([(x2, y2), (int(x2 - ux*head + px*head*0.4), int(y2 - uy*head + py*head*0.4)),
                  (int(x2 - ux*head - px*head*0.4), int(y2 - uy*head - py*head*0.4))], fill='#333333')
    if label:
        mx, my = (x1+x2)//2, (y1+y2)//2
        draw.text((mx, my - 12), label, fill='#555555', font=font_arrow, anchor='mm')

# Client Layer
draw_box(30, 60, 280, 300, "Client Layer (Browser)",
         ["React 18 SPA (Vite build)", "", "Admin Pages:", "  Dashboard, Rooms, Tenants,", "  Payments, Complaints,", "  Notices, Expenses, Audit", "", "Tenant Pages:", "  Dashboard, Rent, Complaints,", "  Notices, Profile", "", "API Client (fetch)", "  httpOnly cookie", "  X-Requested-With header"],
         '#dae8fc', '#6c8ebf')

# Nginx
draw_box(380, 160, 170, 80, "Nginx", ["Reverse Proxy", "HTTPS / SSL", "Let's Encrypt"],
         '#fff2cc', '#d6b656')

# Application Layer
draw_box(630, 30, 380, 510, "Application Layer (Node.js / Express)",
         ["", "Security Middleware:", "  Helmet (CSP, HSTS)", "  Rate Limiter (600/15min)", "  CSRF Guard", "  Cookie Parser, JSON (20KB)", "", "Auth Middleware:", "  JWT Verify, DB Active Check,", "  Role Enforcement (ADMIN/TENANT)", "", "Upload Middleware:", "  Multer (memory storage)", "  Magic-Byte Validation", "", "Route Handlers:", "  /auth  /rooms  /tenants", "  /payments  /complaints", "  /notices  /expenses", "  /dashboard  /audit", "", "Business Logic:", "  Zod Validation, Dues Calc,", "  Capacity Check, Audit Log,", "  CSV Export, Receipts"],
         '#d5e8d4', '#82b366')

# Data Layer
draw_box(1090, 80, 260, 280, "Data Layer",
         ["", "pg Pool (Parameterized SQL)", "", "PostgreSQL 16:", "  users, rooms, payments,", "  complaints, announcements,", "  expenses, audit_log", "", "Payment Proofs:", "  BYTEA binary storage", "  in database"],
         '#f8cecc', '#b85450')

# Deployment note
rounded_rect(630, 570, 380, 50, '#e1d5e7', '#9673a6')
draw.text((820, 585), "Deployment: AWS EC2 + RDS", fill='#000000', font=font_label, anchor='mm')
draw.text((820, 605), "Docker Compose | PM2 | Security Groups", fill='#555555', font=font_small, anchor='mm')

# Arrows
arrow(310, 210, 380, 200, "HTTPS")
arrow(550, 200, 630, 200, "Proxy")
arrow(1010, 250, 1090, 220, "SQL :5432")

# Figure caption
draw.text((W//2, H - 40), "Fig. 1. Architecture of the PG Manager system", fill='#000000', font=font_title, anchor='mm')

out = r'D:\Project\pg-manager\report_assets\architecture.png'
img.save(out, 'PNG', dpi=(150, 150))
print(f"Saved: {out}")
