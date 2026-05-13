const express = require('express');
const path = require('path');
const apiRouter = require('./api');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'public')));
app.use('/plan', apiRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('JSON parse error:', err.message);
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  return next(err);
});

app.listen(port, () => {
  console.log(`Smart Meal Planner listening at http://localhost:${port}`);
});
