import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import GroupDetails from './GroupDetails'
import { Loader2 } from 'lucide-react'

export default function GroupDetailsWrapper({ session }) {
    const { groupId } = useParams()
    const navigate = useNavigate()
    const [group, setGroup] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (groupId) {
            fetchGroupDetails()
        }
    }, [groupId])

    const fetchGroupDetails = async () => {
        try {
            const { data, error } = await supabase
                .from('groups')
                .select('*')
                .eq('id', groupId)
                .single()

            if (error) throw error
            setGroup(data)
        } catch (error) {
            console.error('Error fetching group:', error)
            alert('Group not found or access denied.')
            navigate('/dashboard')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#CBD5E1' }}>
                <Loader2 className="spin" size={32} />
            </div>
        )
    }

    if (!group) return null

    return (
        <GroupDetails
            session={session}
            group={group}
            onBack={() => window.location.href = '/dashboard'}
        />
    )
}
