# GM University – TEDx Seat Booking

Students book one seat each, volunteers scan QR tickets at the door, admins run everything.
Built with **Node.js + Express + MongoDB** and plain HTML/CSS/JS (no build step).

---

## 1. Run it on your laptop

You need **Node.js 18 or newer** (`node -v` to check).

```bash
cd gmu-tedx
npm install
cp .env.example .env        # on Windows: copy .env.example .env
```

Open `.env` and fill in:

| Key | What to put |
|---|---|
| `MONGODB_URI` | Your MongoDB connection string (Atlas → Connect → Drivers). Put a database name before the `?`, e.g. `...mongodb.net/gmu_tedx?retryWrites=true` |
| `JWT_SECRET` | Any long random text (32+ characters) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | The first admin account — created automatically on first start |

Then:

```bash
npm start
```

Open http://localhost:3000 and log in with the admin email/password from `.env`.

> **MongoDB Atlas tip:** in Atlas → *Network Access*, add your IP (or `0.0.0.0/0` while testing), otherwise the app can't connect.

---

## 2. Who does what

### Admin (`/admin.html`)
- **Events** → create a TEDx event (title, venue, date/time, poster). Row **A is locked for guests by default** (you can untick that).
- **Manage → Seats**: tap any seat to lock/unlock it for guests, or lock/unlock a whole row. Tap a booked seat to see who booked it (and cancel if needed).
- **Manage → Bookings**: every booking, checked-in or not, search, Export CSV.
- **Manage → Settings**: open/close booking, hide the event, turn row-by-row filling on/off, delete.
- **Students**: everyone who signed up, when they last logged in, and whether they booked a seat for the selected event.
- **Volunteers & Admins**: create volunteer (or extra admin) logins.

### Volunteer (`/volunteer.html`)
- **Scan QR** → camera opens; a valid ticket shows a big green **DONE**, a fake one shows red **INVALID QR CODE**, a reused one shows **ALREADY SCANNED**.
- **Attendees** → scanned / not-scanned lists, with manual check-in as a backup.
- **Seats** → map of filled seats (grey = booked, teal = entered).

### Student
- Sign up with Name, Phone, Email, Dept, Sem, College, Password.
- Open an event → pick **one** seat on the map → Confirm → get the ticket with QR + **Download PDF**.

---

## 3. How the seating works

- The map in `src/config/seatLayout.js` is traced from the Hallama Auditorium screenshot: rows **A–T, 440 seats**, same left / centre / right blocks and the same numbering (e.g. B1–3 left, B4–16 centre, B17–22 right).
- **Row by row:** only the first row with free seats is open (green). When it's full, the next row opens automatically. Fully locked rows (like A for guests) are skipped.
- Pinch / scroll to zoom, drag to move. On phones, the first tap on a zoomed-out map zooms in so small seats are easy to hit.
- Double-booking is impossible: MongoDB unique indexes stop two people getting the same seat, and one student getting two seats, even if they tap at the same instant.
- The seat map refreshes every few seconds, so students see seats disappear as others book.

## 4. QR codes
Each ticket gets a random 24-character code. The QR contains `GMUTEDX:<code>`. Scanning checks the code in the database — anything else is **invalid**, and a code can only be used once.

---

## 5. Putting it online (needed for phone camera scanning)

Phone browsers only allow the camera on **HTTPS**. The easiest free option is **Render**:

1. Push this folder to a GitHub repo (`.env` is git-ignored — don't commit it).
2. Render → New → **Web Service** → pick the repo.
3. Build command `npm install`, start command `npm start`.
4. Add the same values from your `.env` under **Environment**.
5. In Atlas Network Access allow `0.0.0.0/0` (Render's IPs change).

Railway, Fly.io or any VPS work the same way.

---

## Project structure
```
server.js                  app entry, creates the first admin
src/config/seatLayout.js   the auditorium layout (edit here if seats change)
src/models/                User, Event, Booking
src/routes/                auth, events (booking), bookings (tickets/PDF), admin, volunteer (scan)
src/utils/ticket.js        QR + PDF ticket
public/                    all pages, styles and browser scripts
```
