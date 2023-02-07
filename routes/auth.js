const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const userauth = require('../middleware/userauth');
const nodemailer = require('nodemailer');
require('dotenv').config();

// create a new user: post
router.post("/", async (req, res) => {
    try {
        const { name, email, password, passwordverify } = req.body;

        // validation
        if (!name || !email || !password || !passwordverify) {
            return res.status(400).json({ errorMessage: "Please enter all the fields" });
        }
        if (password.length < 8) {
            return res.status(400).json({ errorMessage: "Entered password must be atleast 8 characters long" });
        }
        if (password !== passwordverify) {
            return res.status(400).json({ errorMessage: "Entered passwords do not match" });
        }

        // check user exists or not
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ errorMessage: "User already exists" });
        }

        // hash password
        const salt = await bcrypt.genSalt(10);
        const passwordhash = await bcrypt.hash(password, salt);

        // save a new user
        const newUser = new User({
            name,
            email,
            password: passwordhash,
        });
        const savedUser = await newUser.save();

        // log the user in
        const token = jwt.sign({ user: savedUser.id }, process.env.JWT_SECRET);

        // save the token to http-only cookie
        res.cookie("token", token, {
            httpOnly: true,
            sameSite: "lax",
            // secure: true,
            // remove secure and samesite to lax
        }).send();
    } catch (err) {
        res.status(500).send(err);
    }
})


// login user
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // validate
        if (!email || !password)
            return res.status(400).json({ errorMessage: "Please enter all the fields." });

        const existingUser = await User.findOne({ email });
        if (!existingUser)
            return res.status(401).json({ errorMessage: "Wrong email or password." });

        const passwordCorrect = await bcrypt.compare(
            password,
            existingUser.password
        );
        if (!passwordCorrect) {
            return res.status(401).json({ errorMessage: "Wrong email or password." });
        }

        // sign the token
        const token = jwt.sign({ user: existingUser._id, }, process.env.JWT_SECRET, {
            expiresIn: "8hr",
        });

        // send the token in a HTTP-only cookie
        res.cookie("token", token, {
            httpOnly: true,
            sameSite: "lax",
            // secure: true,
            // remove secure and samesite to lax
        }).send({ message: "Successfully logged in" });
        // console.log(token);
        // return res.status(200).json({ message: "Successfully logged in" });
    } catch (err) {
        res.status(500).send();
    }
});

// middleware
// router.get("/user", (req, res, next) => {
//     const cookies = req.headers.cookie;
//     const token = cookies.split("=")[1];
//     console.log(token);

//     if (!token) {
//         res.status(404).json({ message: "No token found" });
//     }
//     jwt.verify(String(token), process.env.JWT_SECRET, (err, verified) => {
//         if (err) {
//             return res.status(400).json({ message: "Wrong token" });
//         }
//         req.user = verified.user;
//     })
//     next();
// });

// get user details
router.get("/user", userauth, async (req, res, next) => {
    const userId = req.user;
    let user;
    try {
        user = await User.findById(userId, "-password");
    } catch (err) {
        return new Error(err);
    }
    if (!user) {
        return res.status(404).json({ messsage: "User Not FOund" });
    }
    return res.status(200).json({ user });
});

// loggedin
router.get("/loggedIn", (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.json(false);

        jwt.verify(token, process.env.JWT_SECRET);

        res.send(true);
    } catch (err) {
        res.json(false);
    }
});

// logout user
router.get("/logout", (req, res) => {
    res.cookie("token", "", {
        httpOnly: true,
        expires: new Date(0),
        // secure: true,
        sameSite: "lax",
    }).send("logged out successfully");
});

// forgot password
router.post("/forgot/password", async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: email });
    if (!user) {
        return res.status(400).json("User not found");
    }

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '1d'
    });

    const transport = nodemailer.createTransport({
        // host: "smtp.mailtrap.io",
        service:'Gmail',
        port: 2525,
        auth: {
            user: process.env.USER,
            pass: process.env.PASS
        }
    });
    transport.sendMail({
        from: "sociaMedia@gmail.com",
        to: user.email,
        subject: "Reset Token",
        html: `http://localhost:5000/api/auth/reset/password?token=${token}&_id=${user._id}`
    })

    return res.status(200).json("Check your email to reset password")

})

// reset password
router.put("/reset/password" , async(req , res)=>{
    const {token , _id} = req.query;
    if(!token || !_id){
        return res.status(400).json("Invalid req");
    }
    const user = await User.findOne({_id:_id});
    if(!user){
        return res.status(400).json("user not found")
    }

    const {password} = req.body;
    const secpass = await bcrypt.hash(password , 10);
    user.password = secpass;
    await user.save();
    const transport = nodemailer.createTransport({
        service:"Gmail",
        // host: "smtp.mailtrap.io",
        port: 2525,
        auth: {
          user: process.env.USER,
          pass: process.env.PASS
        }
      });
      transport.sendMail({
        from:"sociaMedia@gmail.com",
        to:user.email,
        subject:"Your password reset successfully",
        html:`Now you can login with new password`
      })

      return res.status(200).json("Password updated successfully. Email has been sent")

})

module.exports = router;