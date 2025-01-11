const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');

const app = express();
const port = 3019;


app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: 'my_secret_key',
        resave: false,
        saveUninitialized: false,
    })
);
mongoose
    .connect('mongodb://127.0.0.1:27017/users', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connection successful'))
    .catch((err) => console.error('MongoDB connection error:', err));
    
const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
});


const expenseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true }, 
});


const savingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    date: { type: String, required: true },  
});


const Savings = mongoose.model('Savings', savingsSchema);


const User = mongoose.model('User', userSchema);
const Expense = mongoose.model('Expense', expenseSchema);

app.post('/add-savings', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).send('Unauthorized: Please log in first.');
        }

        const { amount, date } = req.body;

        const datePattern = /^\d{2}-\d{2}-\d{4}$/;
        if (!datePattern.test(date)) {
            return res.status(400).send('Invalid date format. Please use "DD-MM-YYYY".');
        }

        const newSavings = new Savings({
            userId: req.session.userId,
            amount,
            date,  
        });

        await newSavings.save();
        res.json(newSavings);
    } catch (err) {
        console.error('Error adding savings:', err);
        res.status(500).send('Error occurred while adding savings.');
    }
});

app.post('/retrieve-password', async (req, res) => {
    const { username, email } = req.body;

    try {
        const user = await User.findOne({ username, email });
        if (!user) {
            return res.status(404).send('User not found.');
        }

        res.json({ password: user.password });
    } catch (err) {
        console.error('Error retrieving password:', err);
        res.status(500).send('Error occurred while retrieving password.');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'front.html'));  
});


app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {  
        return res.redirect('/');  
    }
    res.sendFile(path.join(__dirname, 'dashboard.html'));  
});

app.post('/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;
        
        if (password !== confirmPassword) {
            return res.status(400).send('Passwords do not match.');
        }
  
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('Email already registered. Please use another email.');
        }

        const user = new User({ username, email, password });
        await user.save();
        res.send('Registration Successful');
    } catch (err) {
        console.error('Error saving data:', err);
        res.status(500).send('Error occurred while registering.');
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(400).send('Invalid username or password');
        }

        req.session.userId = user._id;
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).send('Error occurred while logging in.');
    }
});

app.get('/profile', async (req, res) => {
    try {

        if (!req.session.userId) {
            return res.status(401).send('Unauthorized: Please log in first.');
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(404).send('User not found.');
        }

        res.json({
            username: user.username,
            email: user.email,
        });
    } catch (err) {
        console.error('Error fetching profile details:', err);
        res.status(500).send('Error occurred while fetching profile details.');
    }
});

app.get('/monthly-dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('Unauthorized: Please log in first.');
    }

    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(404).send('User not found.');
        }
        const now = new Date();
        const startOfMonth = `01-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
        const endOfMonth = `${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

        console.log('Start of month:', startOfMonth);
        console.log('End of month:', endOfMonth);

        const totalExpenses = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.session.userId),
                    date: { $gte: startOfMonth.trim(), $lte: endOfMonth.trim() }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        console.log('Total Expenses:', totalExpenses);
        const totalSavings = await Savings.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.session.userId),
                    date: { $gte: startOfMonth.trim(), $lte: endOfMonth.trim() }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        console.log('Total Savings:', totalSavings);
        res.json({
            totalExpenses: totalExpenses.length > 0 ? totalExpenses[0].totalAmount : 0,
            totalSavings: totalSavings.length > 0 ? totalSavings[0].totalAmount : 0
        });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).send('Error occurred while fetching dashboard data.');
    }
});

app.get('/expenses/today', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized: Please log in first.' });
    }

    try {
        
        const dateObj = new Date();
        const startOfDay = new Date(dateObj.setHours(0, 0, 0, 0));  
        const endOfDay = new Date(dateObj.setHours(23, 59, 59, 999));  

        
        const formattedStartDate = `${("0" + startOfDay.getDate()).slice(-2)}-${("0" + (startOfDay.getMonth() + 1)).slice(-2)}-${startOfDay.getFullYear()}`;
        const formattedEndDate = `${("0" + endOfDay.getDate()).slice(-2)}-${("0" + (endOfDay.getMonth() + 1)).slice(-2)}-${endOfDay.getFullYear()}`;

    
        const expenses = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.session.userId), 
                    date: { $gte: formattedStartDate, $lte: formattedEndDate } 
                }
            },
            {
                $group: {
                    _id: "$category",
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        const totalAmount = expenses.reduce((sum, expense) => sum + expense.totalAmount, 0);

        const user = await User.findById(req.session.userId);
        const username = user ? user.username : "User";

        res.json({ username, totalAmount, expenses });
    } catch (err) {
        console.error('Error fetching today\'s expenses:', err);
        res.status(500).json({ error: 'Error occurred while fetching today\'s expenses.' });
    }
});

app.get('/expenses', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('Unauthorized: Please log in first.');
    }

    try {
        const expenses = await Expense.find({ userId: req.session.userId });
        res.json(expenses);
    } catch (err) {
        console.error('Error fetching expenses:', err);
        res.status(500).send('Error occurred while fetching expenses.');
    }
});

app.post('/add-expenses', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).send('Unauthorized: Please log in first.');
        }

        const { name, amount, category, date } = req.body;
        const dateObj = new Date(date);
        const formattedDate = `${("0" + dateObj.getDate()).slice(-2)}-${("0" + (dateObj.getMonth() + 1)).slice(-2)}-${dateObj.getFullYear()}`;

        const newExpense = new Expense({
            userId: req.session.userId,
            name,
            amount,
            category,
            date: formattedDate, 
        });

        await newExpense.save();
        res.json(newExpense);
    } catch (err) {
        console.error('Error adding expense:', err);
        res.status(500).send('Error occurred while adding expense.');
    }
});
const categoryColors = {
    "Food": "rgba(255, 99, 132, 1.0)",
    "Transport": "rgba(54, 162, 235, 1.0)",
    "Entertainment": "rgba(255, 206, 86, 1.0)",
    "Shopping": "rgba(75, 192, 192, 1.0)",
    "Bills": "rgba(153, 102, 255, 1.0)",
    "Health": "rgba(255, 159, 64, 1.0)",
    
};

app.get('/api/expenses/comparison', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized: Please log in first.' });
    }

    try {
        const today = new Date();
        const last3Days = [];
        for (let i = 0; i < 3; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const formattedDate = `${("0" + date.getDate()).slice(-2)}-${("0" + (date.getMonth() + 1)).slice(-2)}-${date.getFullYear()}`;
            last3Days.push(formattedDate);
        }

        const expenses = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.session.userId),
                    date: { $in: last3Days }
                }
            },
            {
                $group: {
                    _id: { date: "$date", category: "$category" },
                    totalAmount: { $sum: "$amount" }
                }
            },
            {
                $sort: { "_id.date": 1 }  
            }
        ]);

        const days = last3Days;
        const chartData = [];
        const categories = [...new Set(expenses.map(exp => exp._id.category))]; 

        categories.forEach(category => {
            const categoryData = {
                label: category,
                data: [0, 0, 0],  
                backgroundColor: categoryColors[category] || 'rgba(0, 0, 0, 1.0)', 
                borderColor: categoryColors[category] ? categoryColors[category].replace('0.2', '1') : 'rgba(0, 0, 0, 1)', // Darker border
                borderWidth: 1
            };

            expenses.forEach(exp => {
                if (exp._id.category === category) {
                    const dayIndex = days.indexOf(exp._id.date);
                    if (dayIndex !== -1) {
                        categoryData.data[dayIndex] = exp.totalAmount;
                    }
                }
            });

            chartData.push(categoryData);
        });

        res.json({ days, chartData });
    } catch (err) {
        console.error('Error fetching expense comparison data:', err);
        res.status(500).json({ error: 'Error occurred while fetching expense comparison data.' });
    }
});


app.get('/api/expenses/week-summary', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized: Please log in first.' });
    }

    try {
        const today = new Date();
        const last7Days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const formattedDate = `${("0" + date.getDate()).slice(-2)}-${("0" + (date.getMonth() + 1)).slice(-2)}-${date.getFullYear()}`;
            last7Days.push(formattedDate);
        }

        
        const expenses = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.session.userId),
                    date: { $in: last7Days }
                }
            },
            {
                $group: {
                    _id: { date: "$date", category: "$category" },
                    totalAmount: { $sum: "$amount" }
                }
            },
            {
                $sort: { "_id.date": 1 }  
            }
        ]);

        
        const days = last7Days;
        const chartData = [];
        const categories = [...new Set(expenses.map(exp => exp._id.category))]; 

        
        categories.forEach(category => {
            const categoryData = {
                label: category,
                data: Array(7).fill(0),  
                backgroundColor: categoryColors[category] || 'rgba(0, 0, 0, 1.0)', 
                borderColor: categoryColors[category] ? categoryColors[category].replace('0.2', '1') : 'rgba(0, 0, 0, 1)', // Darker border
                borderWidth: 1
            };

            
            expenses.forEach(exp => {
                if (exp._id.category === category) {
                    const dayIndex = days.indexOf(exp._id.date);
                    if (dayIndex !== -1) {
                        categoryData.data[dayIndex] = exp.totalAmount;
                    }
                }
            });

            chartData.push(categoryData);
        });

        
        res.json({ days, chartData });
    } catch (err) {
        console.error('Error fetching expense comparison data:', err);
        res.status(500).json({ error: 'Error occurred while fetching expense comparison data.' });
    }
});

app.get('/api/expenses/last30days', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized: Please log in first.' });
    }

    try {
        const today = new Date();
        const last30Days = [];
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const formattedDate = `${("0" + date.getDate()).slice(-2)}-${("0" + (date.getMonth() + 1)).slice(-2)}-${date.getFullYear()}`;
            last30Days.push(formattedDate);
        }

        const expenses = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.session.userId),
                    date: { $in: last30Days }
                }
            },
            {
                $group: {
                    _id: { date: "$date", category: "$category" },
                    totalAmount: { $sum: "$amount" }
                }
            },
            {
                $sort: { "_id.date": 1 }  
            }
        ]);

        const days = last30Days;
        const chartData = [];
        const categories = [...new Set(expenses.map(exp => exp._id.category))]; 

        categories.forEach(category => {
            const categoryData = {
                label: category,
                data: Array(30).fill(0),  
                backgroundColor: categoryColors[category] || 'rgba(0, 0, 0, 1.0)',  
                borderColor: categoryColors[category] ? categoryColors[category].replace('0.2', '1') : 'rgba(0, 0, 0, 1)', // Darker border
                borderWidth: 1
            };

           
            expenses.forEach(exp => {
                if (exp._id.category === category) {
                    const dayIndex = days.indexOf(exp._id.date);
                    if (dayIndex !== -1) {
                        categoryData.data[dayIndex] = exp.totalAmount;
                    }
                }
            });

            chartData.push(categoryData);
        });

        res.json({ days, chartData });
    } catch (err) {
        console.error('Error fetching expense comparison data:', err);
        res.status(500).json({ error: 'Error occurred while fetching expense comparison data.' });
    }
});

app.put('/update-expense/:id', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).send('Unauthorized: Please log in first.');
        }

        const { id } = req.params;
        const { name, amount, category, date } = req.body;

      
        const dateObj = new Date(date);  
        const formattedDate = `${("0" + dateObj.getDate()).slice(-2)}-${("0" + (dateObj.getMonth() + 1)).slice(-2)}-${dateObj.getFullYear()}`;

        const updatedExpense = await Expense.findOneAndUpdate(
            { _id: id, userId: req.session.userId },
            { name, amount, category, date: formattedDate },  
            { new: true }
        );

        if (!updatedExpense) {
            return res.status(404).send('Expense not found or not authorized.');
        }

        res.json(updatedExpense);
    } catch (err) {
        console.error('Error updating expense:', err);
        res.status(500).send('Error occurred while updating expense.');
    }
});

app.delete('/delete-expense/:id', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).send('Unauthorized: Please log in first.');
        }

        const { id } = req.params;
        const deletedExpense = await Expense.findOneAndDelete({
            _id: id,
            userId: req.session.userId,
        });

        if (!deletedExpense) {
            return res.status(404).send('Expense not found or not authorized.');
        }

        res.sendStatus(200);  
    } catch (err) {
        console.error('Error deleting expense:', err);
        res.status(500).send('Error occurred while deleting expense.');
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error occurred while logging out.');
        }
        res.redirect('/');  
    });
});


app.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
});
