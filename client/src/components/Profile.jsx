import React, { useEffect, useState } from 'react';
// Correct relative path to reach src/supabaseClient.js from components/Profile.jsx
import { supabase } from '../supabaseClient'; 

const Profile = () => {
    const [userProfile, setUserProfile] = useState(null);
    const [solvedProblems, setSolvedProblems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfileData = async () => {
            try {
                // 1. Get the current logged-in user
                const { data: { user } } = await supabase.auth.getUser();

                if (user) {
                    // 2. Fetch profile and submissions in parallel
                    const [profileRes, submissionsRes] = await Promise.all([
                        supabase.from('profiles').select('*').eq('id', user.id).single(),
                        supabase
                            .from('submissions')
                            .select(`
                                problem_id,
                                status,
                                problems ( title, difficulty, slug )
                            `)
                            .eq('user_id', user.id)
                            .eq('status', 'Accepted')
                    ]);

                    if (profileRes.data) setUserProfile(profileRes.data);

                    if (submissionsRes.data) {
                        // Use a Map to ensure unique problems based on problem_id
                        const uniqueSolved = Array.from(
                            new Map(submissionsRes.data
                                .filter(item => item.problems) // Safety check
                                .map(item => [item.problem_id, item.problems])
                            ).values()
                        );
                        setSolvedProblems(uniqueSolved);
                    }
                }
            } catch (error) {
                console.error("Error fetching profile:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProfileData();
    }, []);

    if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading Profile...</div>;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header Section */}
                <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 mb-6 shadow-xl">
                    <h1 className="text-4xl font-extrabold text-blue-500 mb-2">
                        {userProfile?.username || "Coder"}
                    </h1>
                    <p className="text-gray-400">Email: {userProfile?.email || "No email linked"}</p>
                    <div className="mt-4 inline-block bg-blue-900/30 text-blue-400 px-4 py-1 rounded-full border border-blue-500/50">
                        Rank Score: {userProfile?.rank_score || 0}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center shadow-lg">
                        <h3 className="text-gray-400 text-sm uppercase tracking-wider">Problems Solved</h3>
                        <p className="text-5xl font-bold mt-2 text-white">{solvedProblems.length}</p>
                    </div>
                </div>

                {/* Solved Problems List */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
                    <div className="p-6 border-b border-gray-700 bg-gray-800/50">
                        <h3 className="text-xl font-bold">Solved Problems</h3>
                    </div>
                    <ul className="divide-y divide-gray-700">
                        {solvedProblems.length > 0 ? (
                            solvedProblems.map((prob, idx) => (
                                <li key={idx} className="p-4 hover:bg-gray-700/50 transition flex justify-between items-center group">
                                    <div>
                                        <span className="font-semibold group-hover:text-blue-400 transition">{prob?.title}</span>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded font-bold ${
                                        prob?.difficulty === 'Easy' ? 'bg-green-900/40 text-green-400' :
                                        prob?.difficulty === 'Medium' ? 'bg-yellow-900/40 text-yellow-400' : 
                                        'bg-red-900/40 text-red-400'
                                    }`}>
                                        {prob?.difficulty}
                                    </span>
                                </li>
                            ))
                        ) : (
                            <li className="p-8 text-center text-gray-500 italic">No problems solved yet. Time to code!</li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
