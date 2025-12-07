import { useEffect, useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { Link } from 'expo-router'
import { apiClient } from '../src/api/client'

interface Task {
  id: string
  name: string
  duration: number
  importance: number
  urgency: number
  type: string
  completed: boolean
}

export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    checkServer()
  }, [])

  const checkServer = async () => {
    setServerStatus('checking')
    const result = await apiClient.health()
    if (result.data) {
      setServerStatus('online')
      loadTasks()
    } else {
      setServerStatus('offline')
      setError('Cannot connect to server. Make sure the server is running on your Mac.')
      setLoading(false)
    }
  }

  const loadTasks = async () => {
    setLoading(true)
    const result = await apiClient.getTasks()
    if (result.data) {
      setTasks(result.data as Task[])
    } else {
      setError(result.error || 'Failed to load tasks')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16 }}>
          {serverStatus === 'checking' ? 'Connecting to server...' : 'Loading tasks...'}
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, color: 'red', textAlign: 'center' }}>{error}</Text>
        <Pressable
          onPress={checkServer}
          style={{
            marginTop: 20,
            padding: 12,
            backgroundColor: '#007AFF',
            borderRadius: 8,
          }}
        >
          <Text style={{ color: 'white' }}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Tasks</Text>
        <View
          style={{
            backgroundColor: serverStatus === 'online' ? '#34C759' : '#FF3B30',
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 4,
          }}
        >
          <Text style={{ color: 'white', fontSize: 12 }}>
            {serverStatus === 'online' ? 'Connected' : 'Offline'}
          </Text>
        </View>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Link href={`/tasks/${item.id}`} asChild>
            <Pressable
              style={{
                padding: 16,
                backgroundColor: '#f5f5f5',
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: '#666', marginTop: 4 }}>
                {item.duration} min • {item.type}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <Text style={{ color: '#007AFF' }}>
                  I:{item.importance} U:{item.urgency}
                </Text>
                {item.completed && (
                  <Text style={{ color: '#34C759', marginLeft: 8 }}>Completed</Text>
                )}
              </View>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#666' }}>No tasks yet</Text>
          </View>
        }
      />
    </View>
  )
}
